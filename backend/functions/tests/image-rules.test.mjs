// 图片校验/路径纯函数测试（V1.0 Phase 2）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateImage, buildStoragePath, publicUrl } from '../lib/image-rules.mjs';

test('validateImage：合法类型+大小通过', () => {
  for (const mime of ['image/jpeg', 'image/png', 'image/webp', 'image/gif']) {
    assert.deepEqual(validateImage({ mime, size: 1024 }), { ok: true });
  }
});

test('validateImage：非法 MIME / 超 5MB / 空值拒绝', () => {
  assert.equal(validateImage({ mime: 'image/svg+xml', size: 1024 }).ok, false);
  assert.equal(validateImage({ mime: 'image/png', size: 5 * 1024 * 1024 + 1 }).ok, false);
  assert.equal(validateImage({ mime: '', size: 1024 }).ok, false);
  assert.equal(validateImage({ mime: 'image/png', size: 0 }).ok, false);
});

test('buildStoragePath：格式 {task}/{type}/{ts-rand}.{ext}，type 白名单', () => {
  const r = buildStoragePath('t1', 'cover', '封面 图.JPG');
  assert.match(r.path, /^t1\/cover\/[a-z0-9-]+\.jpg$/);
  assert.equal(buildStoragePath('t1', 'content', 'a.png').path.startsWith('t1/content/'), true);
  assert.equal(buildStoragePath('t1', 'other', 'a.png').error !== undefined, true);
});

test('buildStoragePath：路径穿越/无扩展名拒绝', () => {
  assert.equal(buildStoragePath('../evil', 'cover', 'a.png').error !== undefined, true);
  assert.equal(buildStoragePath('t1', 'cover', '../../etc/passwd').error !== undefined, true);
  assert.equal(buildStoragePath('t1', 'cover', 'noext').error !== undefined, true);
});

test('publicUrl：拼接 storage 公共地址', () => {
  assert.equal(
    publicUrl('https://x.supabase.co', 't1/cover/a.jpg'),
    'https://x.supabase.co/storage/v1/object/public/article-images/t1/cover/a.jpg',
  );
});
