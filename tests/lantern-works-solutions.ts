/**
 * Lantern Works reference solutions, replayed by tests/lantern-works-content.test.ts. Each level lists named
 * builds in the script form of src/games/lantern-works/script.ts. From 1-5 on, every level has at least two
 * builds whose machine layouts differ, so no level is a lock with a single key.
 */
export const SOLUTIONS: Record<string, Record<string, string[]>> = {
  '1-1': {
    straight: ['belt 1,1 >>>>>v'],
    low: ['belt 1,1 v>>>>>']
  },
  '1-2': {
    over: ['belt 1,2 >^', 'belt 2,1 >>', 'folder 4,1 v round', 'belt 4,2 v', 'belt 4,3 >', 'belt 5,3 >'],
  },
  '1-3': {
    line: ['folder 1,1 >', 'vat 2,1 > red', 'belt 3,1 >>>v', 'belt 6,2 v'],
  },
  '1-4': {
    down: ['folder 1,1 >', 'belt 2,1 >>v', 'belt 4,2 vv', 'joiner 4,4 v', 'belt 6,4 <<'],
  },
  '1-5': {
    swap: ['folder 1,1 >', 'vat 2,1 > red', 'belt 3,1 >>v', 'belt 5,2 v', 'joiner 5,3 >', 'belt 6,3 >>', 'belt 1,4 >>>>^',
      '@22 belt 2,1 >', '@22 dial 1,1 square'],
    bypass: ['folder 1,1 >', 'belt 2,1 >', 'vat 3,1 > red', 'belt 4,1 >v', 'belt 5,2 v', 'belt 2,2 >>>', 'joiner 5,3 >', 'belt 6,3 >>', 'belt 1,4 >>>>^',
      '@22 rotate 2,1', '@22 dial 1,1 square']
  }
};
