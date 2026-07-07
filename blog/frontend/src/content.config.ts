import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    translationId: z.string(),
    lang: z.enum(['es', 'en']),
    slug: z.string(),
    title: z.string(),
    description: z.string().max(160),
    authorId: z.string(),
    categoryId: z.string(),
    tagIds: z.array(z.string()).default([]),
    coverImage: z.object({
      src: z.string(),
      alt: z.string().min(1),
    }),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    published: z.boolean().default(true),
  }),
});

const categories = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/categories' }),
  schema: z.object({
    es: z.object({ slug: z.string(), title: z.string(), description: z.string() }),
    en: z.object({ slug: z.string(), title: z.string(), description: z.string() }),
  }),
});

const tags = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/tags' }),
  schema: z.object({
    es: z.object({ slug: z.string(), title: z.string() }),
    en: z.object({ slug: z.string(), title: z.string() }),
  }),
});

const authors = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/authors' }),
  schema: z.object({
    es: z.object({ name: z.string(), bio: z.string(), avatar: z.string() }),
    en: z.object({ name: z.string(), bio: z.string(), avatar: z.string() }),
    social: z.object({
      twitter: z.string().optional(),
      linkedin: z.string().optional(),
      github: z.string().optional(),
    }),
  }),
});

export const collections = { posts, categories, tags, authors };
