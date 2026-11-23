import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateCategoriaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  nome: string;
}
