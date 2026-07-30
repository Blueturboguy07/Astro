const computeJaccardSimilarity = (a: string, b: string): number => {
  const wordsA = a.toLowerCase().split(/\W+/);
  const wordsB = b.toLowerCase().split(/\W+/);

  const setA = new Set(wordsA);
  const setB = new Set(wordsB);

  if (setA.size === 0 || setB.size === 0) return 0;

  const union = setA.union(setB);
  const intersections = setA.intersection(setB);

  return intersections.size / union.size;
};

export default computeJaccardSimilarity;
