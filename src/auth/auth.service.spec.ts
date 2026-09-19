import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { DevicesService } from '../devices/devices.service';
import { AuditService } from '../audit/audit.service';
import { Role } from '../common/enums/role.enum';
import { DeviceStatus } from '../common/enums/device-status.enum';

const AGENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER_AGENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const DEVICE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const MAIRE_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

describe('AuthService.login — vérification du device conditionnelle au rôle', () => {
  let service: AuthService;
  let usersServiceMock: { findByUsername: jest.Mock; incrementFailedAttempts: jest.Mock; resetFailedAttempts: jest.Mock };
  let devicesServiceMock: { findById: jest.Mock; touchLastSync: jest.Mock };
  let auditServiceMock: { record: jest.Mock };
  let pinHash: string;

  beforeAll(async () => {
    pinHash = await AuthService.hashPin('1234');
  });

  beforeEach(async () => {
    usersServiceMock = {
      findByUsername: jest.fn(),
      incrementFailedAttempts: jest.fn(async () => undefined),
      resetFailedAttempts: jest.fn(async () => undefined),
    };
    devicesServiceMock = {
      findById: jest.fn(),
      touchLastSync: jest.fn(async () => undefined),
    };
    auditServiceMock = { record: jest.fn(async () => undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersServiceMock },
        { provide: DevicesService, useValue: devicesServiceMock },
        { provide: AuditService, useValue: auditServiceMock },
        { provide: JwtService, useValue: { sign: jest.fn(() => 'fake-jwt-token') } },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  it('un rôle non-agent (maire) se connecte SANS deviceId', async () => {
    usersServiceMock.findByUsername.mockResolvedValue({
      id: MAIRE_ID,
      username: 'maire.cotonou',
      role: Role.MAIRE,
      active: true,
      pinHash,
      lockedUntil: null,
    });

    const result = await service.login({ username: 'maire.cotonou', pin: '1234' }, '127.0.0.1');

    expect(result.accessToken).toBe('fake-jwt-token');
    expect(devicesServiceMock.findById).not.toHaveBeenCalled();
  });

  it('un agent SANS deviceId est rejeté, même avec le bon PIN', async () => {
    usersServiceMock.findByUsername.mockResolvedValue({
      id: AGENT_ID,
      username: 'agent.kofi',
      role: Role.AGENT,
      active: true,
      pinHash,
      lockedUntil: null,
    });

    await expect(
      service.login({ username: 'agent.kofi', pin: '1234' }, '127.0.0.1'),
    ).rejects.toThrow();
  });

  it('un agent avec le device D’UN AUTRE AGENT est rejeté (defense in depth)', async () => {
    usersServiceMock.findByUsername.mockResolvedValue({
      id: AGENT_ID,
      username: 'agent.kofi',
      role: Role.AGENT,
      active: true,
      pinHash,
      lockedUntil: null,
    });
    devicesServiceMock.findById.mockResolvedValue({
      id: DEVICE_ID,
      agentId: OTHER_AGENT_ID, // n'appartient PAS à agent.kofi
      status: DeviceStatus.ACTIVE,
    });

    await expect(
      service.login({ username: 'agent.kofi', pin: '1234', deviceId: DEVICE_ID }, '127.0.0.1'),
    ).rejects.toThrow();
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LOGIN_REJECTED_DEVICE' }),
    );
  });

  it('un agent avec son propre device ACTIVE et le bon PIN se connecte', async () => {
    usersServiceMock.findByUsername.mockResolvedValue({
      id: AGENT_ID,
      username: 'agent.kofi',
      role: Role.AGENT,
      active: true,
      pinHash,
      lockedUntil: null,
    });
    devicesServiceMock.findById.mockResolvedValue({
      id: DEVICE_ID,
      agentId: AGENT_ID,
      status: DeviceStatus.ACTIVE,
    });

    const result = await service.login(
      { username: 'agent.kofi', pin: '1234', deviceId: DEVICE_ID },
      '127.0.0.1',
    );

    expect(result.accessToken).toBe('fake-jwt-token');
    expect(devicesServiceMock.touchLastSync).toHaveBeenCalledWith(DEVICE_ID);
  });

  it('un agent avec son propre device mais BLOQUÉ est rejeté', async () => {
    usersServiceMock.findByUsername.mockResolvedValue({
      id: AGENT_ID,
      username: 'agent.kofi',
      role: Role.AGENT,
      active: true,
      pinHash,
      lockedUntil: null,
    });
    devicesServiceMock.findById.mockResolvedValue({
      id: DEVICE_ID,
      agentId: AGENT_ID,
      status: DeviceStatus.BLOCKED,
    });

    await expect(
      service.login({ username: 'agent.kofi', pin: '1234', deviceId: DEVICE_ID }, '127.0.0.1'),
    ).rejects.toThrow();
  });

  it('un mauvais PIN incrémente le compteur d’échecs', async () => {
    usersServiceMock.findByUsername.mockResolvedValue({
      id: MAIRE_ID,
      username: 'maire.cotonou',
      role: Role.MAIRE,
      active: true,
      pinHash,
      lockedUntil: null,
    });

    await expect(
      service.login({ username: 'maire.cotonou', pin: '0000' }, '127.0.0.1'),
    ).rejects.toThrow();
    expect(usersServiceMock.incrementFailedAttempts).toHaveBeenCalled();
  });
});
