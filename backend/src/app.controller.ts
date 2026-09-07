import { Controller, Get } from '@nestjs/common';
import { Public } from './shared/decorators/public.decorator.js';

@Controller()
export class AppController {
  @Public()
  @Get('health')
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
