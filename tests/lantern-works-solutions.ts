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
  },
  '2-1': {
    foldFirst: ['folder 1,2 >', 'splitter 2,2 >', 'belt 2,1 >', 'vat 3,1 > red', 'belt 4,1 >>vv>', 'belt 2,3 >', 'vat 3,3 > blue', 'belt 4,3 >>'],
    splitFirst: ['splitter 1,2 >', 'belt 1,1 >', 'folder 2,1 >', 'vat 3,1 > red', 'belt 4,1 >>vv>', 'belt 1,3 >', 'folder 2,3 >', 'vat 3,3 > blue', 'belt 4,3 >>']
  },
  '2-2': {
    mixer: ['belt 3,1 >', 'mixer 4,1 v', 'belt 5,1 <', 'folder 1,2 >', 'belt 2,2 >>', 'vat 4,2 >', 'belt 5,2 >v', 'joiner 6,3 >', 'belt 7,3 >', 'belt 1,5 >>>>>^^'],
    oneSide: ['belt 3,1 >>', 'belt 5,1 v', 'mixer 5,2 v', 'folder 1,2 v', 'belt 1,3 >>>>', 'vat 5,3 >', 'joiner 6,3 >', 'belt 7,3 >', 'belt 1,5 >>>>>^^']
  },
  '2-3': {
    oneSorter: ['belt 1,2 >>', 'sorter 3,2 > lotus', 'bin 4,2 >', 'belt 3,1 >>>>'],
    twoSorters: ['belt 1,2 >', 'sorter 2,2 > round', 'bin 2,1 >', 'sorter 3,2 > square', 'bin 3,1 >', 'belt 4,2 >>^', 'belt 6,1 >']
  },
  '2-4': {
    chain: ['folder 1,1 v', 'vat 1,2 v red', 'joiner 1,3 >', 'belt 2,3 >>v', 'belt 4,4 >'],
    roundabout: ['folder 1,1 >', 'belt 2,1 >', 'vat 3,1 v red', 'belt 3,2 v', 'joiner 3,3 >', 'belt 1,3 >>', 'belt 4,3 >v']
  },
  '2-5': {
    twoVats: ['folder 1,3 >', 'belt 2,3 >', 'vat 3,3 >', 'belt 3,1 vv', 'belt 4,3 >>', 'vat 6,3 >', 'belt 6,1 vv', 'belt 7,3 v', 'joiner 7,4 >', 'belt 8,4 >', 'belt 1,6 >>>>>>^^'],
    mixer: ['belt 3,1 >', 'mixer 4,1 v', 'belt 6,1 <<', 'belt 4,2 v', 'folder 1,3 >', 'belt 2,3 >>', 'vat 4,3 >', 'belt 5,3 >>v', 'joiner 7,4 >', 'belt 8,4 >', 'belt 1,6 >>>>>>^^']
  },
  '3-1': {
    bridge: ['folder 1,3 >', 'belt 2,3 >', 'bridge 3,3 >', 'belt 4,3 >>', 'belt 3,1 vv', 'belt 3,4 vv'],
    mergeAndSort: ['folder 1,3 >', 'belt 2,3 >', 'belt 3,1 vvv', 'sorter 3,4 v shell', 'belt 3,5 v', 'belt 4,4 >^', 'belt 5,3 >']
  },
  '3-2': {
    line: ['folder 1,1 >', 'belt 2,1 >v', 'belt 3,2 v', 'joiner 3,3 >', 'belt 1,4 >>^', 'belt 4,3 >', 'wick 5,3 >', 'belt 5,1 vv', 'belt 6,3 >'],
    tucked: ['folder 1,1 >', 'belt 2,1 >v', 'belt 3,2 v', 'joiner 3,3 >', 'belt 1,4 >>^', 'wick 4,3 >', 'belt 5,1 v<', 'belt 4,2 v', 'belt 5,3 >>']
  },
  '3-3': {
    oneGate: ['gate 1,0 > 3', 'belt 2,0 >v', 'belt 3,1 v', 'belt 3,2 >>', 'belt 1,4 >>^', 'belt 3,3 ^', 'belt 6,2 v', 'belt 6,3 v', 'joiner 6,4 >', 'belt 7,4 >'],
    twoGates: ['belt 1,0 >>v', 'gate 3,1 v 4', 'belt 3,2 >>', 'belt 1,4 >', 'gate 2,4 > 4', 'belt 3,4 ^', 'belt 3,3 ^', 'belt 6,2 v', 'belt 6,3 v', 'joiner 6,4 >', 'belt 7,4 >']
  },
  '3-4': {
    around: ['belt 1,5 ^^^^>', 'belt 2,2 vvv>>>>^', 'belt 5,4 <^', 'belt 7,5 ^^<<<', 'belt 4,2 ^^>>>>'],
    overBridge: ['belt 1,5 ^^^^>', 'belt 2,2 >>', 'bridge 4,2 ^', 'belt 5,2 >vv', 'belt 5,4 ^<', 'belt 7,5 <<<^^', 'belt 4,1 ^>>>>']
  },
  '3-5': {
    straight: ['folder 1,1 >', 'belt 2,1 >v', 'belt 3,2 v', 'joiner 3,3 >', 'belt 1,5 >>^^', 'wick 4,3 >', 'belt 4,1 vv', 'belt 5,3 >>>'],
    spare: ['folder 1,1 >', 'belt 2,1 >v', 'belt 3,2 v', 'joiner 3,3 >', 'belt 1,5 >>^^', 'wick 4,3 >', 'belt 4,1 vv', 'splitter 5,3 >', 'belt 5,2 ^>>vv', 'belt 5,4 v>>^^', 'belt 7,3 >']
  },
  '4-1': {
    line: ['folder 1,1 >', 'vat 2,1 > red', 'stamp 3,1 > fu', 'belt 4,1 vv', 'joiner 4,3 >', 'belt 5,3 >>', 'belt 1,4 >>>^'],
    stack: ['folder 1,1 v', 'stamp 1,2 v fu', 'vat 1,3 v red', 'joiner 1,4 >', 'belt 2,4 >>>>^', 'belt 6,3 >']
  },
  '4-2': {
    twoVats: ['folder 1,3 >', 'belt 2,1 vv', 'vat 2,3 > fed', 'belt 3,3 >>', 'vat 5,3 > fed', 'belt 5,1 vv', 'belt 6,3 v', 'joiner 6,4 >', 'bundler 7,4 >', 'belt 1,6 >>>>>^^'],
    mixer: ['belt 2,1 >>', 'mixer 4,1 v', 'belt 5,1 <', 'belt 4,2 v', 'folder 1,3 >', 'belt 2,3 >>', 'vat 4,3 > fed', 'belt 5,3 >v', 'joiner 6,4 >', 'bundler 7,4 >', 'belt 1,6 >>>>>^^']
  },
  '4-3': {
    sorter: ['folder 1,3 >', 'belt 2,3 >', 'vat 3,3 > fed', 'belt 3,1 vv', 'belt 4,3 >', 'joiner 5,3 >', 'belt 1,6 >>>>^^^', 'sorter 6,3 > red', 'belt 6,2 ^>>', 'belt 7,3 vv>'],
    splitter: ['folder 1,3 >', 'belt 2,3 >', 'vat 3,3 > fed', 'belt 3,1 vv', 'belt 4,3 >', 'joiner 5,3 >', 'belt 1,6 >>>>^^^', 'splitter 6,3 >', 'belt 6,2 ^>>', 'belt 6,4 v>>']
  },
  '4-4': {
    dial: ['folder 1,1 > round', 'belt 2,1 >>v', 'joiner 4,2 >', 'belt 5,2 >>', 'belt 1,4 >>>^^', '@11 dial 1,1 lotus'],
    sortOut: ['splitter 1,1 >', 'belt 1,0 >', 'folder 2,0 > round', 'belt 3,0 v', 'belt 1,2 >', 'folder 2,2 > lotus', 'belt 3,2 ^', 'belt 3,1 >', 'sorter 4,1 > lotus', 'bin 4,0 >', 'belt 5,1 v', 'joiner 5,2 >', 'belt 6,2 >', 'belt 1,4 >>>>^^', '@27 dial 4,1 round']
  },
  '4-5': {
    market: ['splitter 1,1 >', 'belt 1,0 >', 'folder 2,0 > round', 'vat 3,0 > red', 'belt 4,0 >>v', 'belt 6,1 vvvvv',
      'belt 1,2 v', 'splitter 1,3 v', 'belt 2,3 >', 'folder 3,3 > lotus', 'vat 4,3 > yellow', 'stamp 5,3 > fu',
      'belt 0,3 vv>', 'folder 1,5 > square', 'vat 2,5 > blue', 'belt 3,5 >>>',
      'belt 1,6 >>>>>', 'joiner 6,6 >', 'sorter 7,6 > blue R', 'belt 7,7 >>', 'belt 8,6 ^^', 'sorter 8,4 ^ yellow R', 'wick 8,3 ^', 'belt 8,2 ^>', 'belt 7,1 vv>'],
    swapped: ['splitter 1,1 >', 'belt 1,0 >', 'folder 2,0 > round', 'vat 3,0 > red', 'belt 4,0 >>v', 'belt 6,1 vvvvv',
      'belt 1,2 v', 'splitter 1,3 v', 'belt 2,3 >', 'folder 3,3 > square', 'vat 4,3 > blue', 'belt 5,3 >',
      'belt 0,3 vv>', 'folder 1,5 > lotus', 'vat 2,5 > yellow', 'stamp 3,5 > fu', 'belt 4,5 >>',
      'belt 1,6 >>>>>', 'joiner 6,6 >', 'sorter 7,6 > blue R', 'belt 7,7 >>', 'belt 8,6 ^^', 'sorter 8,4 ^ yellow R', 'wick 8,3 ^', 'belt 8,2 ^>', 'belt 7,1 vv>']
  }
};
