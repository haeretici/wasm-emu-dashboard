
#ifndef _CPUADDR_H_
#define _CPUADDR_H_

extern int32_t OpAddress;

static void Immediate8(void)
{
   OpAddress = ICPU.ShiftedPB + CPU.PC - CPU.PCBase;
   CPU.PC++;
}

static void Immediate16(void)
{
   OpAddress = ICPU.ShiftedPB + CPU.PC - CPU.PCBase;
   CPU.PC += 2;
}

static void Relative(void)
{
   int8_t Int8 = *CPU.PC++;
#ifndef SA1_OPCODES
   CPU.Cycles += CPU.MemSpeed;
#endif
   OpAddress = ((int32_t)(CPU.PC - CPU.PCBase) + Int8) & 0xffff;
}

static void RelativeLong(void)
{
#ifdef FAST_LSB_WORD_ACCESS
   OpAddress = *(uint16_t*) CPU.PC;
#else
   OpAddress = CPU.PC[0] + (CPU.PC[1] << 8);
#endif
#ifndef SA1_OPCODES
   CPU.Cycles += CPU.MemSpeedx2 + ONE_CYCLE;
#endif
   CPU.PC += 2;
   OpAddress += (CPU.PC - CPU.PCBase);
   OpAddress &= 0xffff;
}

static void AbsoluteIndexedIndirect(bool read)
{
#ifdef FAST_LSB_WORD_ACCESS
   OpAddress = (ICPU.Registers.X.W + * (uint16_t*) CPU.PC) & 0xffff;
#else
   OpAddress = (ICPU.Registers.X.W + CPU.PC[0] + (CPU.PC[1] << 8)) & 0xffff;
#endif
#ifndef SA1_OPCODES
   CPU.Cycles += CPU.MemSpeedx2;
#endif
   OpenBus = CPU.PC[1];
   CPU.PC += 2;
   OpAddress = S9xGetWord(ICPU.ShiftedPB + OpAddress);
   if (read)
      OpenBus = (uint8_t)(OpAddress >> 8);
}

static void AbsoluteIndirectLong(bool read)
{
#ifdef FAST_LSB_WORD_ACCESS
   OpAddress = *(uint16_t*) CPU.PC;
#else
   OpAddress = CPU.PC[0] + (CPU.PC[1] << 8);
#endif
#ifndef SA1_OPCODES
   CPU.Cycles += CPU.MemSpeedx2;
#endif
   OpenBus = CPU.PC[1];
   CPU.PC += 2;
   if (read)
      OpAddress = S9xGetWord(OpAddress) | ((OpenBus = S9xGetByte(OpAddress + 2)) << 16);
   else
      OpAddress = S9xGetWord(OpAddress) | (S9xGetByte(OpAddress + 2) << 16);
}

static void AbsoluteIndirect(bool read)
{
#ifdef FAST_LSB_WORD_ACCESS
   OpAddress = *(uint16_t*) CPU.PC;
#else
   OpAddress = CPU.PC[0] + (CPU.PC[1] << 8);
#endif
#ifndef SA1_OPCODES
   CPU.Cycles += CPU.MemSpeedx2;
#endif
   OpenBus = CPU.PC[1];
   CPU.PC += 2;
   OpAddress = S9xGetWord(OpAddress);
   if (read)
      OpenBus = (uint8_t) (OpAddress >> 8);
   OpAddress += ICPU.ShiftedPB;
}

static void Absolute(bool read)
{
#ifdef FAST_LSB_WORD_ACCESS
   OpAddress = *(uint16_t*) CPU.PC + ICPU.ShiftedDB;
#else
   OpAddress = CPU.PC[0] + (CPU.PC[1] << 8) + ICPU.ShiftedDB;
#endif
   if (read)
      OpenBus = CPU.PC[1];
   CPU.PC += 2;
#ifndef SA1_OPCODES
   CPU.Cycles += CPU.MemSpeedx2;
#endif
}

static void AbsoluteLong(bool read)
{
#ifdef FAST_LSB_WORD_ACCESS
   OpAddress = (*(uint32_t*) CPU.PC) & 0xffffff;
#elif defined FAST_ALIGNED_LSB_WORD_ACCESS
   if (((int32_t) CPU.PC & 1) == 0)
      OpAddress = (*(uint16_t*) CPU.PC) + (CPU.PC[2] << 16);
   else
      OpAddress = *CPU.PC + ((*(uint16_t*) (CPU.PC + 1)) << 8);
#else
   OpAddress = CPU.PC[0] + (CPU.PC[1] << 8) + (CPU.PC[2] << 16);
#endif
   if (read)
      OpenBus = CPU.PC[2];
   CPU.PC += 3;
#ifndef SA1_OPCODES
   CPU.Cycles += CPU.MemSpeedx2 + CPU.MemSpeed;
#endif
}

static void Direct(bool read)
{
   if (read)
      OpenBus = *CPU.PC;
   OpAddress = (*CPU.PC++ + ICPU.Registers.D.W) & 0xffff;
#ifndef SA1_OPCODES
   CPU.Cycles += CPU.MemSpeed;
#endif
}

static void DirectIndirectIndexed(bool read)
{
   OpenBus = *CPU.PC;
   OpAddress = (*CPU.PC++ + ICPU.Registers.D.W) & 0xffff;
#ifndef SA1_OPCODES
   CPU.Cycles += CPU.MemSpeed;
#endif
   OpAddress = S9xGetWord(OpAddress);
   if (read)
      OpenBus = (uint8_t)(OpAddress >> 8);
   OpAddress += ICPU.ShiftedDB + ICPU.Registers.Y.W;
}

static void DirectIndirectIndexedLong(bool read)
{
   OpenBus = *CPU.PC;
   OpAddress = (*CPU.PC++ + ICPU.Registers.D.W) & 0xffff;
#ifndef SA1_OPCODES
   CPU.Cycles += CPU.MemSpeed;
#endif
   if (read)
      OpAddress = S9xGetWord(OpAddress) + ((OpenBus = S9xGetByte(OpAddress + 2)) << 16) + ICPU.Registers.Y.W;
   else
      OpAddress = S9xGetWord(OpAddress) + (S9xGetByte(OpAddress + 2) << 16) + ICPU.Registers.Y.W;
}

static void DirectIndexedIndirect(bool read)
{
   OpenBus = *CPU.PC;
   OpAddress = (*CPU.PC++ + ICPU.Registers.D.W + ICPU.Registers.X.W) & 0xffff;
#ifndef SA1_OPCODES
   CPU.Cycles += CPU.MemSpeed;
#endif
   OpAddress = S9xGetWord(OpAddress);
   if (read)
      OpenBus = (uint8_t)(OpAddress >> 8);
   OpAddress += ICPU.ShiftedDB;
#ifndef SA1_OPCODES
   CPU.Cycles += ONE_CYCLE;
#endif
}

static void DirectIndexedX(bool read)
{
   if (read)
      OpenBus = *CPU.PC;
   OpAddress = (*CPU.PC++ + ICPU.Registers.D.W + ICPU.Registers.X.W);
   OpAddress &= CheckEmulation() ? 0xff : 0xffff;
#ifndef SA1_OPCODES
   CPU.Cycles += CPU.MemSpeed + ONE_CYCLE;
#endif
}

static void DirectIndexedY(bool read)
{
   if (read)
      OpenBus = *CPU.PC;
   OpAddress = (*CPU.PC++ + ICPU.Registers.D.W + ICPU.Registers.Y.W);
   OpAddress &= CheckEmulation() ? 0xff : 0xffff;
#ifndef SA1_OPCODES
   CPU.Cycles += CPU.MemSpeed + ONE_CYCLE;
#endif
}

static void AbsoluteIndexedX(bool read)
{
#ifdef FAST_LSB_WORD_ACCESS
   OpAddress = ICPU.ShiftedDB + *(uint16_t*) CPU.PC + ICPU.Registers.X.W;
#else
   OpAddress = ICPU.ShiftedDB + CPU.PC[0] + (CPU.PC[1] << 8) + ICPU.Registers.X.W;
#endif
   if (read)
      OpenBus = CPU.PC[1];
   CPU.PC += 2;
#ifndef SA1_OPCODES
   CPU.Cycles += CPU.MemSpeedx2;
#endif
}

static void AbsoluteIndexedY(bool read)
{
#ifdef FAST_LSB_WORD_ACCESS
   OpAddress = ICPU.ShiftedDB + *(uint16_t*) CPU.PC + ICPU.Registers.Y.W;
#else
   OpAddress = ICPU.ShiftedDB + CPU.PC[0] + (CPU.PC[1] << 8) + ICPU.Registers.Y.W;
#endif
   if (read)
      OpenBus = CPU.PC[1];
   CPU.PC += 2;
#ifndef SA1_OPCODES
   CPU.Cycles += CPU.MemSpeedx2;
#endif
}

static void AbsoluteLongIndexedX(bool read)
{
#ifdef FAST_LSB_WORD_ACCESS
    OpAddress = (*(uint32_t*) CPU.PC + ICPU.Registers.X.W) & 0xffffff;
#elif defined FAST_ALIGNED_LSB_WORD_ACCESS
   if (((int32_t) CPU.PC & 1) == 0)
       OpAddress = ((*(uint16_t*) CPU.PC) + (CPU.PC[2] << 16) + ICPU.Registers.X.W) & 0xFFFFFF;
   else
       OpAddress = (*CPU.PC + ((*(uint16_t*) (CPU.PC + 1)) << 8) + ICPU.Registers.X.W) & 0xFFFFFF;
#else
    OpAddress = (CPU.PC[0] + (CPU.PC[1] << 8) + (CPU.PC[2] << 16) + ICPU.Registers.X.W) & 0xffffff;
#endif
    if (read)
       OpenBus = CPU.PC[2];
   CPU.PC += 3;
#ifndef SA1_OPCODES
    CPU.Cycles += CPU.MemSpeedx2 + CPU.MemSpeed;
#endif
}

static void DirectIndirect(bool read)
{
   OpenBus = *CPU.PC;
   OpAddress = (*CPU.PC++ + ICPU.Registers.D.W) & 0xffff;
#ifndef SA1_OPCODES
   CPU.Cycles += CPU.MemSpeed;
#endif
   OpAddress = S9xGetWord(OpAddress);
   if (read)
      OpenBus = (uint8_t)(OpAddress >> 8);
   OpAddress += ICPU.ShiftedDB;
}

static void DirectIndirectLong(bool read)
{
   OpenBus = *CPU.PC;
   OpAddress = (*CPU.PC++ + ICPU.Registers.D.W) & 0xffff;
#ifndef SA1_OPCODES
   CPU.Cycles += CPU.MemSpeed;
#endif
   if (read)
      OpAddress = S9xGetWord(OpAddress) + ((OpenBus = S9xGetByte(OpAddress + 2)) << 16);
   else
      OpAddress = S9xGetWord(OpAddress) + (S9xGetByte(OpAddress + 2) << 16);
}

static void StackRelative(bool read)
{
   if (read)
      OpenBus = *CPU.PC;
   OpAddress = (*CPU.PC++ + ICPU.Registers.S.W) & 0xffff;
#ifndef SA1_OPCODES
   CPU.Cycles += CPU.MemSpeed + ONE_CYCLE;
#endif
}

static void StackRelativeIndirectIndexed(bool read)
{
   OpenBus = *CPU.PC;
   OpAddress = (*CPU.PC++ + ICPU.Registers.S.W) & 0xffff;
#ifndef SA1_OPCODES
   CPU.Cycles += CPU.MemSpeed + TWO_CYCLES;
#endif
   OpAddress = S9xGetWord(OpAddress);
   if (read)
      OpenBus = (uint8_t)(OpAddress >> 8);
   OpAddress = (OpAddress + ICPU.ShiftedDB + ICPU.Registers.Y.W) & 0xffffff;
}
#endif
