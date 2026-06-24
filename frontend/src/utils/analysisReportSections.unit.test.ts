import { describe, expect, it } from 'vitest'
import { getFinalAnalysisReportText } from './analysisReportSections'

describe('analysis report final display helpers', () => {
  it('returns original report when no auto quality repair section exists', () => {
    const report = '# 需求分析报告\n\n## 主要功能需求\n\n- 用户登录'
    expect(getFinalAnalysisReportText(report)).toBe(report)
  })

  it('shows only auto quality repaired final report body when present', () => {
    const report = [
      '# 原始报告',
      '',
      '## 主要功能需求',
      '',
      '- 原始内容',
      '',
      '---',
      '',
      '## 自动质量修复版',
      '',
      '# 最终报告',
      '',
      '## 主要功能需求',
      '',
      '- 修复后的内容',
    ].join('\n')

    expect(getFinalAnalysisReportText(report)).toBe('# 最终报告\n\n## 主要功能需求\n\n- 修复后的内容')
  })
})
