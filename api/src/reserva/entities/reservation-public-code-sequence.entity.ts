import { Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('reservation_public_code_sequence')
export class ReservationPublicCodeSequence {
  @PrimaryGeneratedColumn()
  id: number;
}
