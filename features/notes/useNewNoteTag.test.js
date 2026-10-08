import test from 'node:test';
import assert from 'node:assert/strict';
import { findCurrentTag } from './newNoteTagUtils.js';

test('findCurrentTag finds a selected nested tag', () => {
  const tags = [{
    tagId: 1,
    name: '工作',
    children: [{
      tagId: 2,
      name: '项目',
      children: [{ tagId: 3, name: '周报' }],
    }],
  }];

  assert.deepEqual(findCurrentTag(tags, [], '?tagId=3'), { tagId: 3, name: '周报' });
});

test('findCurrentTag returns null when the tag is absent', () => {
  assert.equal(findCurrentTag([{ tagId: 1, name: '工作' }], [], '?tagId=99'), null);
});
