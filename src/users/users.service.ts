import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Role } from '../common/enums/role.enum';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  findByUsername(username: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { username } });
  }

  findById(id: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { id } });
  }

  async create(data: {
    username: string;
    pinHash: string;
    role: Role;
    fullName?: string;
    supervisorPhone?: string;
  }): Promise<User> {
    const user = this.usersRepo.create(data);
    return this.usersRepo.save(user);
  }

  async incrementFailedAttempts(user: User): Promise<User> {
    user.failedLoginAttempts += 1;

    if (user.failedLoginAttempts === 5) {
      user.lockedUntil = new Date(Date.now() + 5 * 60 * 1000); // 5 min
    } else if (user.failedLoginAttempts >= 10) {
      // Blocage dur : déblocage uniquement via OTP envoyé au superviseur (hors périmètre
      // de ce squelette — brancher ici un SmsOtpService / endpoint dédié).
      user.lockedUntil = new Date('9999-12-31');
    }

    return this.usersRepo.save(user);
  }

  async resetFailedAttempts(user: User): Promise<User> {
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    return this.usersRepo.save(user);
  }

  async unlockWithOtp(user: User): Promise<User> {
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    return this.usersRepo.save(user);
  }
}
