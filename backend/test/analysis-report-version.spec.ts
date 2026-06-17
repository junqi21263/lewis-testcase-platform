import {
  buildAnalysisVersionDiff,
  nextAnalysisVersionNumber,
  normalizeCrossReviewStatus,
} from '@/modules/ai/analysis-report-version.util'

describe('analysis report version utilities', () => {
  it('calculates the next report version number', () => {
    expect(nextAnalysisVersionNumber([])).toBe(1)
    expect(nextAnalysisVersionNumber([{ versionNumber: 1 }, { versionNumber: 3 }])).toBe(4)
  })

  it('builds a compact diff between analysis report versions', () => {
    const diff = buildAnalysisVersionDiff(
      {
        markdown: '## 主要功能需求\n- 登录',
        structured: {
          qualityScores: { completeness: 60, testability: 50 },
          openQuestions: [{ id: 'Q-001', text: '角色不明确' }],
        },
      },
      {
        markdown: '## 主要功能需求\n- 登录\n- 下单',
        structured: {
          qualityScores: { completeness: 90, testability: 80 },
          openQuestions: [],
        },
      },
    )

    expect(diff).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'markdown', changed: true }),
        expect.objectContaining({ field: 'qualityScores', before: expect.stringContaining('60'), after: expect.stringContaining('90') }),
        expect.objectContaining({ field: 'openQuestions', before: expect.stringContaining('角色不明确'), after: '无' }),
      ]),
    )
  })

  it('normalizes async cross review status values', () => {
    expect(normalizeCrossReviewStatus('running')).toBe('running')
    expect(normalizeCrossReviewStatus('unexpected')).toBe('pending')
    expect(normalizeCrossReviewStatus(undefined)).toBe('pending')
  })
})
