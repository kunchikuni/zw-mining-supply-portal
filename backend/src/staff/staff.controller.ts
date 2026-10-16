import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { StaffService } from './staff.service';
import { CreateStaffDto, SetStaffDisabledDto } from './dto/staff.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt.strategy';

// Platform admins only, not verifiers. The first admin comes from
// `npm run create:staff -- --role PLATFORM_ADMIN`.
@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @Get()
  list() {
    return this.staffService.list();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @Post()
  create(@Body() dto: CreateStaffDto) {
    return this.staffService.create(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @Patch(':id/disabled')
  setDisabled(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: SetStaffDisabledDto) {
    return this.staffService.setDisabled(id, dto.disabled, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @Post(':id/reset-password')
  resetPassword(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.staffService.resetPassword(id, user);
  }
}
