/**
 * Thin fetch wrapper over the panel backend. Requests are same-origin and
 * proxied to the backend by the Vite dev server (see vite.config.ts).
 */
import type { Author, Category, PostListItem, PostPayload, Tag } from './types';

export interface ApiResponse<T = any> {
  status: number;
  ok: boolean;
  data: T;
}

async function request<T = any>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { status: res.status, ok: res.ok, data };
}

const id = (value: string) => encodeURIComponent(value);

export const api = {
  // Posts
  listPosts: () => request<{ posts: PostListItem[] }>('GET', '/api/posts'),
  getPost: (postId: string) => request<{ post: PostPayload }>('GET', `/api/posts/${id(postId)}`),
  createPost: (payload: PostPayload, linkTo?: string) =>
    request<{ id: string; translationId: string; warning: boolean }>('POST', '/api/posts', { payload, linkTo }),
  updatePost: (postId: string, payload: PostPayload) =>
    request<{ id: string; translationId: string }>('PUT', `/api/posts/${id(postId)}`, { payload }),
  deletePost: (postId: string) => request('DELETE', `/api/posts/${id(postId)}`),

  // Categories
  listCategories: () => request<{ categories: Category[] }>('GET', '/api/categories'),
  createCategory: (body: Category) => request('POST', '/api/categories', body),
  updateCategory: (categoryId: string, body: Category) => request('PUT', `/api/categories/${id(categoryId)}`, body),
  deleteCategory: (categoryId: string) => request<{ usageCount?: number }>('DELETE', `/api/categories/${id(categoryId)}`),
  categoryUsage: (categoryId: string) =>
    request<{ usageCount: number; posts: string[] }>('GET', `/api/categories/${id(categoryId)}/usage`),

  // Tags
  listTags: () => request<{ tags: Tag[] }>('GET', '/api/tags'),
  createTag: (body: Tag) => request('POST', '/api/tags', body),
  updateTag: (tagId: string, body: Tag) => request('PUT', `/api/tags/${id(tagId)}`, body),
  deleteTag: (tagId: string) => request<{ usageCount: number }>('DELETE', `/api/tags/${id(tagId)}`),

  // Authors
  listAuthors: () => request<{ authors: Author[] }>('GET', '/api/authors'),
  createAuthor: (body: Author) => request('POST', '/api/authors', body),
  updateAuthor: (authorId: string, body: Author) => request('PUT', `/api/authors/${id(authorId)}`, body),
  deleteAuthor: (authorId: string) => request<{ usageCount?: number }>('DELETE', `/api/authors/${id(authorId)}`),
  authorUsage: (authorId: string) =>
    request<{ usageCount: number; posts: string[] }>('GET', `/api/authors/${id(authorId)}/usage`),
};
