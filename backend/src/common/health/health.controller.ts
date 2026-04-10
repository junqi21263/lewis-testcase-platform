import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';

@Controller('health')
export class HealthController {
  @Get()
  checkHealth(@Res() response: Response) {
    response.status(HttpStatus.OK).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'testcase-platform-backend'
    });
  }
}