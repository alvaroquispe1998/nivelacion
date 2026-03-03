import { IsEmail, IsNotEmpty } from 'class-validator';

export class CreateHostDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;
}
