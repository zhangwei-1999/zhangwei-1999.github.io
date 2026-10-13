export type Language = "en" | "zh";
export type Localized = { en: string; zh: string };
export type SocialPlatform =
  | "google-scholar"
  | "github"
  | "orcid"
  | "semantic-scholar"
  | "dblp";
export interface ResourceLink {
  label: string;
  url: string;
  icon?: SocialPlatform;
}
export interface Profile {
  name: Localized;
  role: Localized;
  institution: Localized;
  institutionUrl: string;
  institutionShort: string;
  researchLabel: Localized;
  location: Localized;
  email: string;
  portrait: string;
  portraitSmall?: string;
  portraitMobile?: string;
  portraitWidth: number;
  portraitHeight: number;
  portraitAlt: Localized;
  bio: Localized[];
  interests: Localized[];
  links: ResourceLink[];
  tagline: Localized;
  siteUrl: string;
  repository: string;
  lastUpdated: string;
  education: {
    degree: Localized;
    institution: Localized;
    department?: Localized;
    url: string;
    departmentUrl?: string;
    period: Localized;
    location: Localized;
    logo: string;
  }[];
}
export interface News {
  id: string;
  date: string;
  datePrecision?: "day" | "month";
  emoji: string;
  content: Localized;
  link?: string;
  category?: string;
}
export interface Publication {
  id: string;
  title: string;
  titleZh?: string;
  authors: string;
  venue: string;
  year: number;
  category: string;
  cover: string;
  featured: boolean;
  description?: Localized;
  badges?: string[];
  links: ResourceLink[];
}
export interface Award {
  id: string;
  year: number;
  title: Localized;
  organization?: Localized;
  description?: Localized;
  link?: string;
}
export interface Photo {
  id: string;
  src: string;
  thumbnail?: string;
  alt: Localized;
  caption?: Localized;
  width: number;
  height: number;
  date?: string;
  year?: number;
  section?: string;
  sequence?: number;
}
export interface Album {
  slug: string;
  title: Localized;
  description: Localized;
  cover?: string;
  photos: Photo[];
  layout?: "wide";
  presentation?: "timeline" | "curated";
  sections?: {
    id: string;
    title: Localized;
    description?: Localized;
    layout?: "timeline" | "birthday" | "grid" | "artwork" | "concert";
  }[];
  private?: {
    access?: "managed";
    manifest: string;
    photoCount: number;
    hint: Localized;
  };
  /** Public encrypted delivery; this view key is intentionally public. */
  encrypted?: {
    manifest: string;
    photoCount: number;
    viewKey: string;
  };
  /** Independent public cover key, never the password-protected album key. */
  encryptedCover?: {
    manifest: string;
    viewKey: string;
    photoId: string;
  };
}
export interface Quote {
  text: string;
  author: string;
}
