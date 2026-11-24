import { describe, expect, it, vi } from 'vitest'
import { cached } from './iam-config.server'

describe('cached', () => {
  it('shares one in-flight load between concurrent callers', async () => {
    const load = vi.fn(async () => 'value')
    const [a, b] = await Promise.all([cached('shared', load), cached('shared', load)])
    expect([a, b]).toEqual(['value', 'value'])
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('does not remember a failed load', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('IAM down')).mockResolvedValueOnce('value')
    await expect(cached('flaky', load)).rejects.toThrow('IAM down')
    await expect(cached('flaky', load)).resolves.toBe('value')
    expect(load).toHaveBeenCalledTimes(2)
  })
})
