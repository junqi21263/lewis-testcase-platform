import { NotFoundException } from '@nestjs/common'
import { FilesService } from '@/modules/files/files.service'

function createFilesService(prismaMock: any) {
  prismaMock.uploadedFile = {
    findMany: jest.fn().mockResolvedValue([]),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    delete: jest.fn(),
    create: jest.fn(),
    ...(prismaMock.uploadedFile ?? {}),
  }
  const configMock = {
    get: jest.fn((key: string, defaultValue?: string) => {
      if (key === 'UPLOAD_DIR') return './.tmp-test-uploads'
      return defaultValue
    }),
  }
  return new FilesService(
    prismaMock,
    configMock as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {
      parseFromText: jest.fn(() => null),
      toPromptContext: jest.fn(() => ''),
    } as any,
  )
}

describe('FilesService access and pagination guards', () => {
  it('getFileById blocks cross-user access by returning not found', async () => {
    const prismaMock = {
      uploadedFile: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    }
    const svc = createFilesService(prismaMock)
    await expect(svc.getFileById('file-1', 'user-b')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('getFileById returns file for owner', async () => {
    const file = {
      id: 'file-1',
      status: 'PARSED',
      updatedAt: new Date(),
      uploaderId: 'user-a',
    }
    const prismaMock = {
      uploadedFile: {
        findFirst: jest.fn().mockResolvedValue({ id: 'file-1' }),
        findUnique: jest.fn().mockResolvedValue(file),
      },
    }
    const svc = createFilesService(prismaMock)
    await expect(svc.getFileById('file-1', 'user-a')).resolves.toEqual(file)
  })

  it('getFileById requeues stale parsing task when source still exists', async () => {
    const staleAt = new Date(Date.now() - 20 * 60_000)
    const updated = {
      id: 'file-1',
      status: 'PENDING',
      parseStage: 'PENDING',
      parseError: null,
    }
    const prismaMock = {
      uploadedFile: {
        findFirst: jest.fn().mockResolvedValue({ id: 'file-1' }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'file-1',
          status: 'PARSING',
          path: __filename,
          parseAttempts: 1,
          lastHeartbeatAt: staleAt,
          updatedAt: staleAt,
          uploaderId: 'user-a',
        }),
        update: jest.fn().mockResolvedValue(updated),
      },
    }
    const svc = createFilesService(prismaMock)
    await expect(svc.getFileById('file-1', 'user-a')).resolves.toEqual(updated)
    expect(prismaMock.uploadedFile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'file-1' },
        data: expect.objectContaining({
          status: 'PENDING',
          parseStage: 'PENDING',
          parseError: null,
        }),
      }),
    )
  })

  it('getFileList clamps invalid page and oversized pageSize', async () => {
    const prismaMock = {
      uploadedFile: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    }
    const svc = createFilesService(prismaMock)
    await svc.getFileList('user-1', -3 as any, 999999 as any)

    expect(prismaMock.uploadedFile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 100,
      }),
    )
  })
})
