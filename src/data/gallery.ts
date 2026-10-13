import type { Album } from "../types";
import generatedPrivateAlbums from "./gallery-private.generated.json" with { type: "json" };
import publicAlbums from "./gallery-public.generated.json" with { type: "json" };

const privateAlbums = generatedPrivateAlbums as Record<string, Pick<NonNullable<Album["private"]>, "manifest" | "photoCount" | "access">>;

// Original photographs, local publication settings and private passwords stay in
// .private/gallery/. Only encrypted delivery files and public view keys are shipped.
// Public cover keys are independent from the protected album key.
const hint = {
  en: "My favorite song. Hint: an English song, four words, initial capital.",
  zh: "我最喜欢的歌名，提示：英文歌，四词，首字母大写",
};

export const gallery: Album[] = [
  {
    slug: "life",
    title: { en: "Life", zh: "生活" },
    description: {
      en: "A chill in the open sky; a swallow glides by.",
      zh: "寥宇生寒，燕影轻掠。",
    },
    presentation: "timeline",
    private: { ...privateAlbums.life, hint },
    encryptedCover: publicAlbums.covers.life,
    photos: [],
  },
  {
    slug: "photography",
    title: { en: "Photography", zh: "摄影" },
    description: {
      en: "Light and shadow shift; the sky stirs the heart.",
      zh: "光影流转，天空心动。",
    },
    presentation: "curated",
    encrypted: publicAlbums.albums.photography,
    encryptedCover: publicAlbums.covers.photography,
    sections: [
  {
    "id": "light-and-sky",
    "title": {
      "en": "Light & Sky",
      "zh": "天光与水色"
    },
    "description": {
      "en": "Changing skies, sunlit water, and light caught through windows.",
      "zh": "变换的天空、映着日光的水面，与窗边停留的光。"
    },
    "layout": "grid"
  },
  {
    "id": "botanical-notes",
    "title": {
      "en": "Botanical Notes",
      "zh": "花叶之间"
    },
    "description": {
      "en": "Petals, leaves, and small studies in color and texture.",
      "zh": "花瓣、绿叶，以及色彩与质感的细微记录。"
    },
    "layout": "grid"
  },
  {
    "id": "after-the-rain",
    "title": {
      "en": "After the Rain",
      "zh": "雨后的片刻"
    },
    "description": {
      "en": "Reflections, empty paths, and the quiet of rain-washed spaces.",
      "zh": "倒影、安静的小径，与雨水洗过的角落。"
    },
    "layout": "grid"
  },
  {
    "id": "city-frames",
    "title": {
      "en": "City Frames",
      "zh": "城市取景"
    },
    "description": {
      "en": "Architecture, courtyards, and details noticed along the way.",
      "zh": "建筑、庭院，以及行走时留意到的细节。"
    },
    "layout": "grid"
  },
  {
    "id": "everyday-warmth",
    "title": {
      "en": "Everyday Warmth",
      "zh": "日常暖意"
    },
    "description": {
      "en": "Candlelight, familiar objects, and small moments of everyday warmth.",
      "zh": "烛光、熟悉的物件，与日常生活中的一点暖意。"
    },
    "layout": "grid"
  }
],
    photos: [],
  },
  {
    slug: "aesthetic",
    title: { en: "Aesthetic", zh: "美学" },
    description: {
      en: "Half a moon, awaiting fullness. When shall we share a drink?",
      zh: "月半待圆，何日小酌。",
    },
    presentation: "curated",
    encrypted: publicAlbums.albums.aesthetic,
    encryptedCover: publicAlbums.covers.aesthetic,
    sections: [
      {
        id: "prints",
        title: { en: "The art of a frame", zh: "画面之间" },
        description: { en: "Hong Kong cinema, an enduring passion.", zh: "港片格调，常怀热忱。" },
        layout: "artwork",
      },
      {
        id: "concert",
        title: { en: "Bound for 1982 · After Tomorrow", zh: "开往1982 · 明天过后" },
        description: { en: "Stage lights, a shared sky, and the feeling of being there.", zh: "舞台灯光、同一片天空，与置身其中的感动。" },
        layout: "concert",
      },
    ],
    photos: [],
  },
  {
    slug: "lover",
    title: { en: "Lover", zh: "爱人" },
    description: {
      en: "A quiet place for the moments closest to the heart.",
      zh: "留给心底珍藏的时光。",
    },
    layout: "wide",
    // TODO: add your own local photographs and cover via the encryption guide.
    private: { ...privateAlbums.lover, hint: { ...hint } },
    photos: [],
  },
];
