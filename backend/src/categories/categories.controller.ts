import { Body, Controller, Get, Post } from '@nestjs/common';
import { CategoriesService } from './categories.service';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  findAll() {
    return this.categoriesService.findAll();
  }

  // Platform-admin only in practice — e.g. "PPE", "Earthmoving equipment",
  // "Catering", "Chemicals & reagents", "Transport & haulage", "Security"
  @Post()
  create(@Body('name') name: string, @Body('description') description?: string) {
    return this.categoriesService.create(name, description);
  }
}
