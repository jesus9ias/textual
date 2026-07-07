/** Shared UI types, mirroring the backend's payloads and the Domain Model. */

export interface LocalizedText {
  slug: string;
  title: string;
  description?: string;
}

export interface Category {
  id: string;
  es: LocalizedText;
  en: LocalizedText;
}

export interface Tag {
  id: string;
  es: { slug: string; title: string };
  en: { slug: string; title: string };
}

export interface Author {
  id: string;
  es: { name: string; bio: string; avatar: string };
  en: { name: string; bio: string; avatar: string };
  social: Record<string, string>;
}

export interface PostListItem {
  id: string;
  translationId: string;
  lang: string;
  slug: string;
  title: string;
  categoryId: string;
  authorId: string;
  tagIds: string[];
  published: boolean;
  missingTranslations: string[];
}

export interface PostPayload {
  translationId: string;
  lang: string;
  slug: string;
  title: string;
  description: string;
  authorId: string;
  categoryId: string;
  tagIds: string[];
  coverImage: { src: string; alt: string };
  createdAt: string;
  updatedAt: string;
  published: boolean;
  body: string;
}

export type Lang = 'es' | 'en';
