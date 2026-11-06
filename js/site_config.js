/** Product identity kept separate from the inherited atlas and its translations. */
(function (root) {
  'use strict';
  const site = Object.freeze({
    name: '江山影像',
    nameEn: 'Jiangshan Scenes',
    baseUrl: 'https://js-scenes.vercel.app/',
    repository: 'https://github.com/xcv58/jiangshan-map',
    upstream: 'https://github.com/DeanChensj/jiangshan-map',
    description: '在中国历史地图中观看历史与文学影像，结合时代、地点与史料探索故事。AI 演绎与文学虚构均有明确标注。',
    descriptionEn: 'Explore historical and literary videos in their map, era and source context. AI dramatizations and fictional elements are explicitly labeled.',
  });
  if (typeof module === 'object' && module.exports) module.exports = site;
  if (root) root.ATLAS_SITE = site;
})(typeof window === 'object' ? window : null);
