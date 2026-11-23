import { IsBoolean } from 'class-validator';

export class UpdateClienteStatusDto {
  @IsBoolean()
  active: boolean;
}
