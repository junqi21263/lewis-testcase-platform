export const CASE_OUTPUT_REQUIRED_FIELDS = [
  'title',
  'module',
  'priority',
  'riskLevel',
  'type',
  'precondition',
  'steps',
  'expectedResult',
  'tags',
  'mermaid',
  'requirementIds',
  'testPathIds',
  'automationReadiness',
] as const

export type CaseOutputRequiredField = (typeof CASE_OUTPUT_REQUIRED_FIELDS)[number]

export type SchemaValidationResult = {
  ok: boolean
  errors: string[]
  missingFields: string[]
}

export const TESTCASE_OUTPUT_JSON_SCHEMA = {
  name: 'testcase_generation_result',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['cases'],
    properties: {
      cases: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [...CASE_OUTPUT_REQUIRED_FIELDS],
          properties: {
            title: { type: 'string' },
            module: { type: 'string' },
            priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
            riskLevel: { type: 'string', enum: ['high', 'medium', 'low'] },
            type: {
              type: 'string',
              enum: ['FUNCTIONAL', 'PERFORMANCE', 'SECURITY', 'COMPATIBILITY', 'REGRESSION'],
            },
            precondition: { type: 'string' },
            steps: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['order', 'action', 'expected'],
                properties: {
                  order: { type: 'integer' },
                  action: { type: 'string' },
                  expected: { type: 'string' },
                },
              },
            },
            expectedResult: { type: 'string' },
            tags: {
              type: 'array',
              items: { type: 'string' },
            },
            mermaid: {
              anyOf: [{ type: 'string' }, { type: 'null' }],
            },
            requirementIds: {
              type: 'array',
              items: { type: 'string' },
            },
            testPathIds: {
              type: 'array',
              items: { type: 'string' },
            },
            automationReadiness: {
              type: 'object',
              additionalProperties: false,
              required: ['status', 'reason'],
              properties: {
                status: { type: 'string', enum: ['automatable', 'manual', 'blocked'] },
                reason: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
} as const

export function buildStrictCaseResponseFormat() {
  return {
    type: 'json_schema',
    json_schema: TESTCASE_OUTPUT_JSON_SCHEMA,
  }
}

export function buildJsonObjectResponseFormat() {
  return { type: 'json_object' }
}

export function isStructuredOutputUnsupportedError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err)
  return /response_format|json_schema|schema|structured output|invalid parameter|unsupported|not support|不支持/i.test(message || '')
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function nonEmptyString(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0
}

function validateEnum(errors: string[], path: string, value: unknown, allowed: readonly string[]) {
  if (!nonEmptyString(value) || !allowed.includes(String(value))) {
    errors.push(`${path} must be one of ${allowed.join(', ')}`)
  }
}

export function validateCaseRowsAgainstSchema(rows: unknown[]): SchemaValidationResult {
  const errors: string[] = []
  const missingFields = new Set<string>()

  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      ok: false,
      errors: ['cases must be a non-empty array'],
      missingFields: ['cases'],
    }
  }

  rows.forEach((row, rowIndex) => {
    const prefix = `cases[${rowIndex}]`
    if (!isPlainObject(row)) {
      errors.push(`${prefix} must be an object`)
      return
    }

    for (const field of CASE_OUTPUT_REQUIRED_FIELDS) {
      if (!(field in row)) {
        missingFields.add(field)
        errors.push(`${prefix}.${field} is required`)
      }
    }

    if ('title' in row && !nonEmptyString(row.title)) errors.push(`${prefix}.title must be non-empty`)
    if ('module' in row && !nonEmptyString(row.module)) errors.push(`${prefix}.module must be non-empty`)
    if ('priority' in row) validateEnum(errors, `${prefix}.priority`, row.priority, ['P0', 'P1', 'P2', 'P3'])
    if ('riskLevel' in row) validateEnum(errors, `${prefix}.riskLevel`, row.riskLevel, ['high', 'medium', 'low'])
    if ('type' in row) {
      validateEnum(errors, `${prefix}.type`, row.type, ['FUNCTIONAL', 'PERFORMANCE', 'SECURITY', 'COMPATIBILITY', 'REGRESSION'])
    }
    if ('precondition' in row && typeof row.precondition !== 'string') {
      errors.push(`${prefix}.precondition must be a string`)
    }
    if ('expectedResult' in row && !nonEmptyString(row.expectedResult)) {
      errors.push(`${prefix}.expectedResult must be non-empty`)
    }
    if ('tags' in row && !Array.isArray(row.tags)) errors.push(`${prefix}.tags must be an array`)
    if ('mermaid' in row && row.mermaid !== null && typeof row.mermaid !== 'string') {
      errors.push(`${prefix}.mermaid must be a string or null`)
    }
    if ('requirementIds' in row && !Array.isArray(row.requirementIds)) {
      errors.push(`${prefix}.requirementIds must be an array`)
    }
    if ('testPathIds' in row && !Array.isArray(row.testPathIds)) {
      errors.push(`${prefix}.testPathIds must be an array`)
    }
    if ('automationReadiness' in row) {
      if (!isPlainObject(row.automationReadiness)) {
        errors.push(`${prefix}.automationReadiness must be an object`)
      } else {
        const readiness = row.automationReadiness
        if (!['automatable', 'manual', 'blocked'].includes(String(readiness.status))) {
          errors.push(`${prefix}.automationReadiness.status must be one of automatable, manual, blocked`)
        }
        if (typeof readiness.reason !== 'string') {
          errors.push(`${prefix}.automationReadiness.reason must be a string`)
        }
      }
    }

    if ('steps' in row) {
      if (!Array.isArray(row.steps) || row.steps.length === 0) {
        errors.push(`${prefix}.steps must be a non-empty array`)
      } else {
        row.steps.forEach((step, stepIndex) => {
          const stepPrefix = `${prefix}.steps[${stepIndex}]`
          if (!isPlainObject(step)) {
            errors.push(`${stepPrefix} must be an object`)
            return
          }
          for (const field of ['order', 'action', 'expected'] as const) {
            if (!(field in step)) {
              missingFields.add(`steps.${field}`)
              errors.push(`${stepPrefix}.${field} is required`)
            }
          }
          if ('order' in step && (!Number.isInteger(step.order) || Number(step.order) < 1)) {
            errors.push(`${stepPrefix}.order must be a positive integer`)
          }
          if ('action' in step && !nonEmptyString(step.action)) {
            errors.push(`${stepPrefix}.action must be non-empty`)
          }
          if ('expected' in step && typeof step.expected !== 'string') {
            errors.push(`${stepPrefix}.expected must be a string`)
          }
        })
      }
    }
  })

  return {
    ok: errors.length === 0,
    errors,
    missingFields: [...missingFields],
  }
}
