/**
 * Unit tests for the hreflang alternate builder, one test per `T-I18N-*` id
 * defined in blog/spec.md. Pure — no Astro build involved.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHreflangAlternates } from '../hreflang.mjs';

const SITE_URL = 'https://textual.example.com';
const OPTIONS = { siteUrl: SITE_URL, defaultLang: 'es' };

const esBlackHoles = {
  translationId: 'black-holes-formation',
  lang: 'es',
  slug: 'como-se-forman-los-agujeros-negros',
  published: true,
};
const enBlackHoles = {
  translationId: 'black-holes-formation',
  lang: 'en',
  slug: 'how-black-holes-form',
  published: true,
};
const soloPost = {
  translationId: 'solo-post',
  lang: 'es',
  slug: 'post-unico',
  published: true,
};

test('T-I18N-01: builds alternate links for a fully-translated pair', () => {
  const alternates = buildHreflangAlternates(esBlackHoles, [esBlackHoles, enBlackHoles], OPTIONS);

  const langs = alternates.map((a) => a.hreflang);
  assert.deepEqual(langs.sort(), ['en', 'es', 'x-default']);

  const en = alternates.find((a) => a.hreflang === 'en');
  assert.equal(en.href, `${SITE_URL}/en/how-black-holes-form`);
  const es = alternates.find((a) => a.hreflang === 'es');
  assert.equal(es.href, `${SITE_URL}/es/como-se-forman-los-agujeros-negros`);
});

test('T-I18N-02: returns no alternates for an untranslated post', () => {
  const alternates = buildHreflangAlternates(soloPost, [soloPost, esBlackHoles, enBlackHoles], OPTIONS);
  assert.deepEqual(alternates, []);
});

test('T-I18N-03: x-default always points at the defaultLang version', () => {
  const alternates = buildHreflangAlternates(enBlackHoles, [esBlackHoles, enBlackHoles], OPTIONS);
  const xDefault = alternates.find((a) => a.hreflang === 'x-default');
  assert.equal(xDefault.href, `${SITE_URL}/es/como-se-forman-los-agujeros-negros`);
});
