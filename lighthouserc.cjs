module.exports = {
  ci: {
    collect: {
      staticDistDir: './dist',
      numberOfRuns: 1,
      settings: { preset: 'desktop', onlyCategories: ['performance', 'accessibility', 'best-practices'] }
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.85 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['error', { minScore: 0.9 }]
      }
    },
    upload: { target: 'filesystem', outputDir: './.lighthouseci' }
  }
};
