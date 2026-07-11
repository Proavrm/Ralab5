export function computeG3TestSummary(tests = []) {
  const summary = {
    total: tests.length,
    conforme: 0,
    non_conforme: 0,
    en_attente: 0,
    non_applicable: 0,
  }

  for (const test of tests) {
    const value = String(test.conformity || 'En attente').trim()
    if (value === 'Conforme') summary.conforme += 1
    else if (value === 'Non conforme') summary.non_conforme += 1
    else if (value === 'Non applicable') summary.non_applicable += 1
    else summary.en_attente += 1
  }

  return summary
}
