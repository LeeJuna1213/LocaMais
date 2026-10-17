import { UserType } from "../enums/user.enum.js";

export class CreateUserDto {
    name:string;
    email:string;
    password:string;
    type:UserType;
}
