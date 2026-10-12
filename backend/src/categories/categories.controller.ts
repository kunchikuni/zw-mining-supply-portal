import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  findAll() {
    return this.categoriesService.findAll();
  }

  // Platform-admin only — e.g. "PPE", "Earthmoving equipment", "Catering",
  // "Chemicals & reagents", "Transport & haulage", "Security". Suppliers pick
  // from this list, so it can't be open to anyone who can reach the API.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @Post()
  create(@Body('name') name: string, @Body('description') description?: string) {
    return this.categoriesService.create(name, description);
  }
}
