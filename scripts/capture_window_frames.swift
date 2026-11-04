// macOS-only validation tool for web benchmarks; not part of the app runtime.
// swiftc -O -parse-as-library -swift-version 5 capture_window_frames.swift -o /tmp/capture-window
import Foundation
import AppKit
import ScreenCaptureKit
import CoreMedia
import CoreVideo
import CoreGraphics
import CryptoKit
import CoreImage
import ImageIO
import Darwin

final class StopFlag: @unchecked Sendable {
    private let lock = NSLock()
    private var value = false
    func stop() { lock.lock(); value = true; lock.unlock() }
    var stopped: Bool { lock.lock(); defer { lock.unlock() }; return value }
}

final class FrameReceiver: NSObject, SCStreamOutput, SCStreamDelegate {
    let queue = DispatchQueue(label: "atlas.window-frame-audit", qos: .userInitiated)
    let stop: StopFlag
    let roi: [String: Double]
    private var basis = mach_timebase_info_data_t()
    private var frames = [[String: Any]]()
    private var errorText: String?
    private var firstImage: CVPixelBuffer?
    private var previousImage: CVPixelBuffer?
    init(stop: StopFlag, roi: [String: Double]) { self.stop = stop; self.roi = roi; super.init(); mach_timebase_info(&basis) }
    func micros(_ ticks: UInt64) -> Double { Double(ticks) * Double(basis.numer) / Double(basis.denom) / 1000 }
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        queue.async { self.errorText = error.localizedDescription }
        stop.stop()
    }
    func stream(_ stream: SCStream, didOutputSampleBuffer sample: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, sample.isValid,
              let image = sample.imageBuffer,
              let attachments = CMSampleBufferGetSampleAttachmentsArray(sample, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
              let attachment = attachments.first,
              let rawStatus = attachment[.status] as? Int,
              let status = SCFrameStatus(rawValue: rawStatus) else { return }
        let now = mach_absolute_time()
        var row: [String: Any] = ["receivedHostUs": micros(now), "status": rawStatus,
            "ptsSeconds": CMTimeGetSeconds(sample.presentationTimeStamp)]
        if let displayed = attachment[.displayTime] as? NSNumber {
            row["displayMachTicks"] = displayed.uint64Value
            row["displayHostUs"] = micros(displayed.uint64Value)
        }
        if status == .complete {
            let begin = mach_absolute_time()
            CVPixelBufferLockBaseAddress(image, .readOnly)
            if let base = CVPixelBufferGetBaseAddress(image) {
                let stride = CVPixelBufferGetBytesPerRow(image), width = CVPixelBufferGetWidth(image), height = CVPixelBufferGetHeight(image)
                if firstImage == nil { firstImage = image }
                let sx = Double(width) / roi["outerWidth"]!, sy = Double(height) / roi["outerHeight"]!
                let x = max(0, min(width - 1, Int((roi["x"]! * sx).rounded(.down))))
                let y = max(0, min(height - 1, Int((roi["y"]! * sy).rounded(.down))))
                let rw = max(1, min(width - x, Int((roi["width"]! * sx).rounded(.down))))
                let rh = max(1, min(height - y, Int((roi["height"]! * sy).rounded(.down))))
                var changed = true
                if let previous = previousImage, CVPixelBufferGetWidth(previous) == width, CVPixelBufferGetHeight(previous) == height {
                    CVPixelBufferLockBaseAddress(previous, .readOnly)
                    if let oldBase = CVPixelBufferGetBaseAddress(previous) {
                        changed = false
                        let oldStride = CVPixelBufferGetBytesPerRow(previous)
                        // Compare displayed BGRA bytes exactly; skip row padding.
                        // Early exit is cheaper than hashing entire large frames.
                        for row in y..<(y + rh) {
                            if memcmp(base.advanced(by: row * stride + x * 4), oldBase.advanced(by: row * oldStride + x * 4), rw * 4) != 0 {
                                changed = true
                                break
                            }
                        }
                    }
                    CVPixelBufferUnlockBaseAddress(previous, .readOnly)
                }
                row["pixelChanged"] = changed
                previousImage = image
                row["width"] = width; row["height"] = height
                row["hashedRect"] = [x, y, rw, rh]
            }
            CVPixelBufferUnlockBaseAddress(image, .readOnly)
            row["comparisonMicros"] = micros(mach_absolute_time() - begin)
        }
        frames.append(row)
    }
    func save(to file: String, window: SCWindow, config: SCStreamConfiguration) throws {
        try queue.sync {
            let result: [String: Any] = ["complete": errorText == nil, "error": errorText as Any? ?? NSNull(),
                "method": "ScreenCaptureKit desktop-independent capture of the owned Chrome window at its native backing resolution; exact BGRA byte comparisons of a map ROI exclude row padding and browser chrome. No synthetic animation. This observes WindowServer content, not physical photon emission.",
                "windowId": window.windowID, "ownerPid": window.owningApplication?.processID ?? 0,
                "windowBounds": ["x": window.frame.origin.x, "y": window.frame.origin.y, "width": window.frame.width, "height": window.frame.height],
                "requestedCaptureHz": 120, "captureWidth": config.width, "captureHeight": config.height,
                "requestedRoi": roi,
                "timebaseNumer": basis.numer, "timebaseDenom": basis.denom, "frames": frames]
            let bytes = try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys])
            try bytes.write(to: URL(fileURLWithPath: file))
            // Write one validation image after capture has stopped, outside the
            // measured window. It confirms the owned window and ROI alignment.
            if let firstImage = firstImage {
                let image = CIImage(cvPixelBuffer: firstImage)
                if let cg = CIContext(options: [.useSoftwareRenderer: true]).createCGImage(image, from: image.extent),
                   let destination = CGImageDestinationCreateWithURL(URL(fileURLWithPath: file + ".png") as CFURL, "public.png" as CFString, 1, nil) {
                    CGImageDestinationAddImage(destination, cg, nil)
                    CGImageDestinationFinalize(destination)
                }
            }
        }
    }
}

@main struct WindowFrameCapture {
    @MainActor
    static func main() async {
        do {
            let application = NSApplication.shared
            application.setActivationPolicy(.prohibited)
            guard CommandLine.arguments.count == 4, let pid = Int32(CommandLine.arguments[1]),
                  let roiData = CommandLine.arguments[3].data(using: .utf8),
                  let roi = try JSONSerialization.jsonObject(with: roiData) as? [String: Double],
                  ["x", "y", "width", "height", "outerWidth", "outerHeight"].allSatisfy({ roi[$0] != nil }) else {
                throw NSError(domain: "atlas-capture", code: 1, userInfo: [NSLocalizedDescriptionKey: "Usage: capture-window owned-browser-pid output.json roi-json; write a line to stdin to stop"])
            }
            guard CGPreflightScreenCaptureAccess() else {
                throw NSError(domain: "atlas-capture", code: 2, userInfo: [NSLocalizedDescriptionKey: "Screen capture access is unavailable; this tool does not request access."])
            }
            let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
            guard let window = content.windows.filter({ $0.owningApplication?.processID == pid && $0.windowLayer == 0 && $0.frame.width > 500 && $0.frame.height > 300 }).max(by: { $0.frame.width * $0.frame.height < $1.frame.width * $1.frame.height }) else {
                throw NSError(domain: "atlas-capture", code: 3, userInfo: [NSLocalizedDescriptionKey: "Owned Chrome window not found"])
            }
            let config = SCStreamConfiguration()
            let backingScale = NSScreen.main?.backingScaleFactor ?? 2
            config.width = Int((window.frame.width * backingScale).rounded())
            config.height = Int((window.frame.height * backingScale).rounded())
            config.pixelFormat = kCVPixelFormatType_32BGRA
            config.minimumFrameInterval = CMTime(value: 1, timescale: 120)
            config.queueDepth = 8
            config.showsCursor = false
            config.capturesAudio = false
            if #available(macOS 14.0, *) { config.ignoreShadowsSingleWindow = true }
            let flag = StopFlag(), receiver = FrameReceiver(stop: flag, roi: roi)
            let filter = SCContentFilter(desktopIndependentWindow: window)
            let stream = SCStream(filter: filter, configuration: config, delegate: receiver)
            try stream.addStreamOutput(receiver, type: .screen, sampleHandlerQueue: receiver.queue)
            try await stream.startCapture()
            print("{\"ready\":true,\"windowId\":\(window.windowID),\"ownerPid\":\(pid)}")
            fflush(stdout)
            DispatchQueue.global(qos: .utility).async { _ = readLine(); flag.stop() }
            let deadline = Date().addingTimeInterval(45)
            while !flag.stopped && Date() < deadline { try await Task.sleep(nanoseconds: 50_000_000) }
            try await stream.stopCapture()
            try receiver.save(to: CommandLine.arguments[2], window: window, config: config)
        } catch {
            fputs("\(error)\n", stderr)
            exit(1)
        }
    }
}
