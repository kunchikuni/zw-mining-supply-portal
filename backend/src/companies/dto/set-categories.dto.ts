import { ArrayMaxSize, ArrayUnique, IsArray, IsString } from 'class-validator';

export class SetCategoriesDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  categoryIds: string[];
}
