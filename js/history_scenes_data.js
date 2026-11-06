/* Curated external videos. The original platforms host and attribute the media. */
(function (root) {
  'use strict';
  const scenes = [
    {
      id: 'jing-ke', year: -227, range: [-227, -227], coord: [108.71, 34.36], zoom: 8,
      title: { zh: '荆轲刺秦', en: 'Jing Ke’s assassination attempt' },
      date: { zh: '前 227 年', en: '227 BCE' },
      place: { zh: '咸阳附近 · 区域示意', en: 'Near Xianyang · regional reference' },
      summary: { zh: '一卷地图展开，匕首现出。以多机位监控的视角，重新想象荆轲入秦的历史片刻。', en: 'A map unrolls and a dagger is revealed. Multiple surveillance viewpoints reimagine Jing Ke’s encounter with the King of Qin.' },
      history: { zh: '前227年，燕太子丹遣荆轲入秦行刺秦王政，事败。次年秦军攻取燕都蓟城。这是不同年份、不同地点的两件事。', en: 'In 227 BCE, Crown Prince Dan of Yan sent Jing Ke to assassinate King Zheng of Qin. The attempt failed. Qin captured Yan’s capital Ji the following year: a separate event in a different place.' },
      caveat: { zh: '影片中的监控设备、钟点、具体月日、宫殿布景与对白均为演绎。地图标记仅表示咸阳附近的区域，不代表已考定的宫殿或事发殿址。', en: 'The cameras, clock times, precise calendar date, palace staging and dialogue are dramatization. The map marks the Xianyang region, not an established palace or incident site.' },
      provider: 'x', postId: '2117479382197698865', handle: 'LuBtc888', duration: 93,
      credit: { zh: '发布者：0x鸣人 · 原创作者未核实', en: 'Posted by 0x鸣人 · original creator unverified' },
      sources: [{ label: '咸阳市秦都区志 · 大事记', url: 'https://dfz.shaanxi.gov.cn/zslm/fzzlk/xbsxsxz/xbsxz/xys_16200/201405/P020240923610537178923.pdf' }],
    },
    {
      id: 'xuanwu-gate', year: 626, range: [626, 626], coord: [108.94, 34.30], zoom: 8,
      title: { zh: '玄武门之变', en: 'The Xuanwu Gate incident' },
      date: { zh: '626 年', en: '626 CE' },
      place: { zh: '长安 · 太极宫北门区域示意', en: 'Chang’an · approximate Taiji Palace north gate area' },
      summary: { zh: '长安城的一场宫门政变，被重新讲成一段“刚出土”的监控影像。', en: 'A palace coup in Chang’an is retold as supposedly unearthed surveillance footage.' },
      history: { zh: '唐武德九年，李世民在长安玄武门发动政变，李建成、李元吉被杀。李世民随后成为太子，并于同年即位。', en: 'In 626, Li Shimin launched a coup at Xuanwu Gate in Chang’an. Li Jiancheng and Li Yuanji were killed. Li Shimin became crown prince and later emperor that year.' },
      caveat: { zh: '摄像机、镜头时序、人物外貌及具体动作属于AI演绎。标记表示太极宫北门的大致区域，不能用于考定门址。作者在原帖自述使用 Muse。', en: 'The cameras, shot sequence, appearances and movements are AI dramatization. The marker indicates the general north-gate area, not a surveyed gate location. The creator identifies Muse in the original post.' },
      provider: 'x', postId: '2118349031751717306', handle: 'PixelAigc', duration: 120,
      credit: { zh: '创作者：PixelAIGC · 原帖自述生成', en: 'Creator: PixelAIGC · self-described generated work' },
      sources: [{ label: '盐田档案与史志信息网 · 玄武门之变', url: 'https://www.yantian.gov.cn/ytdayszxxw/lsjt/content/post_11736532.html' }],
    },
    {
      id: 'sima-guang', year: 1026, range: [1020, 1030], coord: [113.3, 34.1], zoom: 1.7,
      approximate: true,
      title: { zh: '司马光砸缸', en: 'Sima Guang breaks the jar' },
      date: { zh: '约 1020 年代 · 确切年月未详', en: 'Around the 1020s · exact date uncertain' },
      place: { zh: '北宋 · 故事地点未详', en: 'Northern Song · incident location uncertain' },
      summary: { zh: '孩童落水、众人惊走，司马光持石破瓮救友。熟悉的故事变成庭院里的短片。', en: 'A child falls into a water jar. While the other children flee, Sima Guang breaks it with a stone to release the water.' },
      history: { zh: '《宋史·司马光传》记有持石破瓮救人的童年故事，但未明确写出事发地点。关于年代和地点有不同推断，这里保留不确定性。', en: 'The History of Song records the childhood rescue with a stone and water jar, but does not identify the incident’s location. Dates and locations have been interpreted differently, so uncertainty is retained here.' },
      caveat: { zh: '这里不放置精确事发点。地图仅展示北宋中原背景，以1026年为浏览参考；并非认定故事发生于该年、该处。影片的庭院、人物与动作均为演绎。', en: 'No precise incident pin is shown. The map provides a Northern Song regional view using 1026 as a browsing reference, not a claim about the event’s year or place. The courtyard, characters and movements are dramatization.' },
      provider: 'x', postId: '2118162217447403703', handle: '0xmomonifty', duration: 37,
      credit: { zh: '创作者：0xMomo · 原帖说明制作过程', en: 'Creator: 0xMomo · production process described in the post' },
      sources: [{ label: '国家图书馆 · 司马光传记资料', url: 'https://www.nlc.cn/web/zdxm/bbjd/mobile/dtxx/xmdt/20231127_217361.shtml' }, { label: '华西都市报 · 事发地点的不同考证', url: 'https://e.thecover.cn/shtml/hxdsb/20220720/178828.shtml' }],
    },
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = scenes;
  else root.ATLAS_HISTORY_SCENES = scenes;
})(typeof window === 'undefined' ? globalThis : window);
