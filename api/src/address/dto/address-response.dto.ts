import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Formato público do endereço retornado junto ao cliente. */
export class AddressResponseDto {
  @ApiProperty() id: number;
  @ApiProperty() logradouro: string;
  @ApiProperty() numero: string;
  @ApiPropertyOptional({ nullable: true }) complemento: string | null;
  @ApiProperty() bairro: string;
  @ApiProperty() cidade: string;
  @ApiProperty() uf: string;
  @ApiProperty() cep: string;
  @ApiProperty() pais: string;
}
