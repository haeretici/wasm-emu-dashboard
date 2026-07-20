#define AGNES_AMALGAMATED

#ifdef _MSC_VER
#ifndef _CRT_SECURE_NO_WARNINGS
#define _CRT_SECURE_NO_WARNINGS
#endif /* _CRT_SECURE_NO_WARNINGS */
#endif /* _MSC_VER */

#include "agnes.h"

//-----------------------------------------------------------------------------
// Headers
//-----------------------------------------------------------------------------

//FILE_START:common.h
#ifndef common_h
#define common_h

#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>

#ifdef AGNES_AMALGAMATED
#define AGNES_INTERNAL static
#else
#define AGNES_INTERNAL
#endif

#define AGNES_GET_BIT(byte, bit_ix) (((byte) >> (bit_ix)) & 1)

#endif /* common_h */
//FILE_END
//FILE_START:agnes_types.h
#ifndef agnes_types_h
#define agnes_types_h


/*********************************** AGNES ***********************************/
// Custom CDL
typedef void (*js_audio_write_cb)(uint16_t address, uint8_t value);
static js_audio_write_cb g_audio_callback = NULL;

#endif /* agnes_types_h */
//FILE_END
//FILE_START:cpu.h
#ifndef cpu_h
#define cpu_h


typedef struct agnes agnes_t;
typedef struct cpu cpu_t;

AGNES_INTERNAL void cpu_init(cpu_t *cpu, agnes_t *agnes);
AGNES_INTERNAL int cpu_tick(cpu_t *cpu);
AGNES_INTERNAL void cpu_update_zn_flags(cpu_t *cpu, uint8_t val);
AGNES_INTERNAL void cpu_stack_push8(cpu_t *cpu, uint8_t val);
AGNES_INTERNAL void cpu_stack_push16(cpu_t *cpu, uint16_t val);
AGNES_INTERNAL uint8_t cpu_stack_pop8(cpu_t *cpu);
AGNES_INTERNAL uint16_t cpu_stack_pop16(cpu_t *cpu);
AGNES_INTERNAL uint8_t cpu_get_flags(const cpu_t *cpu);
AGNES_INTERNAL void cpu_restore_flags(cpu_t *cpu, uint8_t flags);
AGNES_INTERNAL void cpu_set_dma_stall(cpu_t *cpu);
AGNES_INTERNAL void cpu_trigger_nmi(cpu_t *cpu);
AGNES_INTERNAL void cpu_trigger_irq(cpu_t *cpu);
AGNES_INTERNAL void cpu_write8(cpu_t *cpu, uint16_t addr, uint8_t val);
AGNES_INTERNAL uint8_t cpu_read8(cpu_t *cpu, uint16_t addr);
AGNES_INTERNAL uint16_t cpu_read16(cpu_t *cpu, uint16_t addr);

#endif /* cpu_h */
//FILE_END
//FILE_START:ppu.h
#ifndef ppu_h
#define ppu_h

typedef struct agnes agnes_t;
typedef struct ppu ppu_t;

AGNES_INTERNAL void ppu_init(ppu_t *ppu, agnes_t *agnes);
AGNES_INTERNAL void ppu_tick(ppu_t *ppu, bool *out_new_frame);
AGNES_INTERNAL uint8_t ppu_read_register(ppu_t *ppu, uint16_t reg);
AGNES_INTERNAL void ppu_write_register(ppu_t *ppu, uint16_t addr, uint8_t val);

#endif /* ppu_h */
//FILE_END
//FILE_START:instructions.h
#ifndef opcodes_h
#define opcodes_h


typedef enum {
    ADDR_MODE_NONE = 0,
    ADDR_MODE_ABSOLUTE,
    ADDR_MODE_ABSOLUTE_X,
    ADDR_MODE_ABSOLUTE_Y,
    ADDR_MODE_ACCUMULATOR,
    ADDR_MODE_IMMEDIATE,
    ADDR_MODE_IMPLIED,
    ADDR_MODE_IMPLIED_BRK,
    ADDR_MODE_INDIRECT,
    ADDR_MODE_INDIRECT_X,
    ADDR_MODE_INDIRECT_Y,
    ADDR_MODE_RELATIVE,
    ADDR_MODE_ZERO_PAGE,
    ADDR_MODE_ZERO_PAGE_X,
    ADDR_MODE_ZERO_PAGE_Y
} addr_mode_t;

typedef struct cpu cpu_t;

typedef int (*instruction_op_fn)(cpu_t *cpu, uint16_t addr, addr_mode_t mode);

typedef struct {
    const char *name;
    uint8_t opcode;
    uint8_t cycles;
    bool page_cross_cycle;
    addr_mode_t mode;
    instruction_op_fn operation;
} instruction_t;

AGNES_INTERNAL instruction_t* instruction_get(uint8_t opcode);
AGNES_INTERNAL uint8_t instruction_get_size(addr_mode_t mode);

#endif /* opcodes_h */
//FILE_END
//FILE_START:mapper.h
#ifndef mapper_h
#define mapper_h

typedef struct agnes agnes_t;

AGNES_INTERNAL bool mapper_init(agnes_t *agnes);
AGNES_INTERNAL uint8_t mapper_read(agnes_t *agnes, uint16_t addr);
AGNES_INTERNAL void mapper_write(agnes_t *agnes, uint16_t addr, uint8_t val);
AGNES_INTERNAL void mapper_pa12_rising_edge(agnes_t *agnes);

#endif /* mapper_h */
//FILE_END
//FILE_START:mapper0.h
#ifndef mapper0_h
#define mapper0_h


typedef struct mapper0 mapper0_t;
typedef struct agnes agnes_t;

AGNES_INTERNAL void mapper0_init(mapper0_t *mapper, agnes_t *agnes);
AGNES_INTERNAL uint8_t mapper0_read(mapper0_t *mapper, uint16_t addr);
AGNES_INTERNAL void mapper0_write(mapper0_t *mapper, uint16_t addr, uint8_t val);

#endif /* mapper0_h */
//FILE_END
//FILE_START:mapper1.h
#ifndef mapper1_h
#define mapper1_h


typedef struct mapper1 mapper1_t;
typedef struct agnes agnes_t;

AGNES_INTERNAL void mapper1_init(mapper1_t *mapper, agnes_t *agnes);
AGNES_INTERNAL uint8_t mapper1_read(mapper1_t *mapper, uint16_t addr);
AGNES_INTERNAL void mapper1_write(mapper1_t *mapper, uint16_t addr, uint8_t val);

#endif /* mapper1_h */
//FILE_END
//FILE_START:mapper2.h
#ifndef mapper2_h
#define mapper2_h

typedef struct mapper2 mapper2_t;
typedef struct agnes agnes_t;

AGNES_INTERNAL void mapper2_init(mapper2_t *mapper, agnes_t *agnes);
AGNES_INTERNAL uint8_t mapper2_read(mapper2_t *mapper, uint16_t addr);
AGNES_INTERNAL void mapper2_write(mapper2_t *mapper, uint16_t addr, uint8_t val);

#endif /* mapper2_h */
//FILE_END
//FILE_START:mapper4.h
#ifndef mapper4_h
#define mapper4_h

typedef struct mapper4 mapper4_t;
typedef struct agnes agnes_t;

AGNES_INTERNAL void mapper4_init(mapper4_t *mapper, agnes_t *agnes);
AGNES_INTERNAL uint8_t mapper4_read(mapper4_t *mapper, uint16_t addr);
AGNES_INTERNAL void mapper4_write(mapper4_t *mapper, uint16_t addr, uint8_t val);
AGNES_INTERNAL void mapper4_pa12_rising_edge(mapper4_t *mapper);

#endif /* mapper4_h */
//FILE_END

//-----------------------------------------------------------------------------
// C files
//-----------------------------------------------------------------------------
//FILE_START:agnes.c
#include <stdlib.h>
#include <string.h>

#include "apu.h"

typedef struct {
    uint8_t magic[4];
    uint8_t prg_rom_banks_count;
    uint8_t chr_rom_banks_count;
    uint8_t flags_6;
    uint8_t flags_7;
    uint8_t prg_ram_banks_count;
    uint8_t flags_9;
    uint8_t flags_10;
    uint8_t zeros[5];
} ines_header_t;

typedef struct agnes_state {
    agnes_t agnes;
} agnes_state_t;

static uint8_t get_input_byte(const agnes_input_t* input);

static agnes_color_t g_colors[64] = {
    {0x7c, 0x7c, 0x7c, 0xff}, {0x00, 0x00, 0xfc, 0xff}, {0x00, 0x00, 0xbc, 0xff}, {0x44, 0x28, 0xbc, 0xff},
    {0x94, 0x00, 0x84, 0xff}, {0xa8, 0x00, 0x20, 0xff}, {0xa8, 0x10, 0x00, 0xff}, {0x88, 0x14, 0x00, 0xff},
    {0x50, 0x30, 0x00, 0xff}, {0x00, 0x78, 0x00, 0xff}, {0x00, 0x68, 0x00, 0xff}, {0x00, 0x58, 0x00, 0xff},
    {0x00, 0x40, 0x58, 0xff}, {0x00, 0x00, 0x00, 0xff}, {0x00, 0x00, 0x00, 0xff}, {0x00, 0x00, 0x00, 0xff},
    {0xbc, 0xbc, 0xbc, 0xff}, {0x00, 0x78, 0xf8, 0xff}, {0x00, 0x58, 0xf8, 0xff}, {0x68, 0x44, 0xfc, 0xff},
    {0xd8, 0x00, 0xcc, 0xff}, {0xe4, 0x00, 0x58, 0xff}, {0xf8, 0x38, 0x00, 0xff}, {0xe4, 0x5c, 0x10, 0xff},
    {0xac, 0x7c, 0x00, 0xff}, {0x00, 0xb8, 0x00, 0xff}, {0x00, 0xa8, 0x00, 0xff}, {0x00, 0xa8, 0x44, 0xff},
    {0x00, 0x88, 0x88, 0xff}, {0x00, 0x00, 0x00, 0xff}, {0x00, 0x00, 0x00, 0xff}, {0x00, 0x00, 0x00, 0xff},
    {0xf8, 0xf8, 0xf8, 0xff}, {0x3c, 0xbc, 0xfc, 0xff}, {0x68, 0x88, 0xfc, 0xff}, {0x98, 0x78, 0xf8, 0xff},
    {0xf8, 0x78, 0xf8, 0xff}, {0xf8, 0x58, 0x98, 0xff}, {0xf8, 0x78, 0x58, 0xff}, {0xfc, 0xa0, 0x44, 0xff},
    {0xf8, 0xb8, 0x00, 0xff}, {0xb8, 0xf8, 0x18, 0xff}, {0x58, 0xd8, 0x54, 0xff}, {0x58, 0xf8, 0x98, 0xff},
    {0x00, 0xe8, 0xd8, 0xff}, {0x78, 0x78, 0x78, 0xff}, {0x00, 0x00, 0x00, 0xff}, {0x00, 0x00, 0x00, 0xff},
    {0xfc, 0xfc, 0xfc, 0xff}, {0xa4, 0xe4, 0xfc, 0xff}, {0xb8, 0xb8, 0xf8, 0xff}, {0xd8, 0xb8, 0xf8, 0xff},
    {0xf8, 0xb8, 0xf8, 0xff}, {0xf8, 0xa4, 0xc0, 0xff}, {0xf0, 0xd0, 0xb0, 0xff}, {0xfc, 0xe0, 0xa8, 0xff},
    {0xf8, 0xd8, 0x78, 0xff}, {0xd8, 0xf8, 0x78, 0xff}, {0xb8, 0xf8, 0xb8, 0xff}, {0xb8, 0xf8, 0xd8, 0xff},
    {0x00, 0xfc, 0xfc, 0xff}, {0xf8, 0xd8, 0xf8, 0xff}, {0x00, 0x00, 0x00, 0xff}, {0x00, 0x00, 0x00, 0xff},
};

agnes_t* agnes_make(void) {
    agnes_t *agnes = (agnes_t*)malloc(sizeof(*agnes));
    if (!agnes) {
        return NULL;
    }
    memset(agnes, 0, sizeof(*agnes));
    memset(agnes->ram, 0xff, sizeof(agnes->ram));
    return agnes;
}

bool agnes_load_ines_data(agnes_t *agnes, void *data, size_t data_size) {
    if (data_size < sizeof(ines_header_t)) {
        return false;
    }

    ines_header_t *header = (ines_header_t*)data;
    if (strncmp((char*)header->magic, "NES\x1a", 4) != 0) {
        return false;
    }

    unsigned prg_rom_offset = sizeof(ines_header_t);
    bool has_trainer = AGNES_GET_BIT(header->flags_6, 2);
    if (has_trainer) {
        prg_rom_offset += 512;
    }
    agnes->gamepack.chr_rom_banks_count = header->chr_rom_banks_count;
    agnes->gamepack.prg_rom_banks_count = header->prg_rom_banks_count;
    if (AGNES_GET_BIT(header->flags_6, 3)) {
        agnes->mirroring_mode = MIRRORING_MODE_FOUR_SCREEN;
    } else {
        agnes->mirroring_mode = AGNES_GET_BIT(header->flags_6, 0) ? MIRRORING_MODE_VERTICAL : MIRRORING_MODE_HORIZONTAL;
    }
    agnes->gamepack.mapper = ((header->flags_6 & 0xf0) >> 4) | (header->flags_7 & 0xf0);
    unsigned prg_rom_size = header->prg_rom_banks_count * (16 * 1024);
    unsigned chr_rom_size = header->chr_rom_banks_count * (8 * 1024);
    unsigned chr_rom_offset = prg_rom_offset + prg_rom_size;

    if ((chr_rom_offset + chr_rom_size) > data_size) {
        return false;
    }

    agnes->gamepack.data = (const uint8_t *)data;
    agnes->gamepack.prg_rom_offset = prg_rom_offset;
    agnes->gamepack.chr_rom_offset = chr_rom_offset;

    bool ok = mapper_init(agnes);
    if (!ok) {
        return false;
    }

    cpu_init(&agnes->cpu, agnes);
    ppu_init(&agnes->ppu, agnes);
    // Custom CDL
    // At this stage, agnes->cartridge has been populated.
    // Calculate the total size of the PRG-ROM data.
    // (NES mappers calculate size in 16KB units called banks)
    int prg_banks = agnes->gamepack.prg_rom_banks_count;
    int chr_banks = agnes->gamepack.chr_rom_banks_count;

    // Calculate total layout size: PRG (16KB chunks) + CHR (8KB chunks)
    // This perfectly mimics the physical structure of the ROM file.
    agnes->cdl_size = (prg_banks * 16384) + (chr_banks * 8192);

    // Allocate clean zeroed out memory space for the CDL
    agnes->cdl_buffer = (uint8_t*)calloc(agnes->cdl_size, sizeof(uint8_t));

    return true;
}

void agnes_set_input(agnes_t *agn, const agnes_input_t *input_1, const agnes_input_t *input_2) {
    if (input_1 != NULL) {
        agn->controllers[0].state = get_input_byte(input_1);
    }
    if (input_2 != NULL) {
        agn->controllers[1].state = get_input_byte(input_2);
    }
}

size_t agnes_get_save_state_size() {
    return sizeof(agnes_state_t);
}

void agnes_dump_state(const agnes_t *agnes, agnes_state_t *out_res) {
    memmove(out_res, agnes, sizeof(agnes_t));
    out_res->agnes.gamepack.data = NULL;
    out_res->agnes.cpu.agnes = NULL;
    out_res->agnes.ppu.agnes = NULL;
    out_res->agnes.apu.buffer_index = 0;
    out_res->agnes.apu.cycle_accumulator = 0.0;
    out_res->agnes.apu.frame_divider = 0;
    switch (out_res->agnes.gamepack.mapper) {
        case 0: out_res->agnes.mapper.m0.agnes = NULL; break;
        case 1: out_res->agnes.mapper.m1.agnes = NULL; break;
        case 2: out_res->agnes.mapper.m2.agnes = NULL; break;
        case 4: out_res->agnes.mapper.m4.agnes = NULL; break;
    }
}

bool agnes_restore_state(agnes_t *agnes, const agnes_state_t *state) {
    const uint8_t *gamepack_data = agnes->gamepack.data;
    memmove(agnes, state, sizeof(agnes_t));
    agnes->gamepack.data = gamepack_data;
    agnes->cpu.agnes = agnes;
    agnes->ppu.agnes = agnes;
    switch (agnes->gamepack.mapper) {
        case 0: agnes->mapper.m0.agnes = agnes; break;
        case 1: agnes->mapper.m1.agnes = agnes; break;
        case 2: agnes->mapper.m2.agnes = agnes; break;
        case 4: agnes->mapper.m4.agnes = agnes; break;
    }
    return true;
}

void ppu_run_for(ppu_t *ppu, int dots, bool *out_new_frame) {
    for (int i = 0; i < dots; i++) {
        ppu_tick(ppu, out_new_frame);
    }
}

bool agnes_tick(agnes_t *agnes, bool *out_new_frame) {
    if (!agnes) return false;

    int cpu_cycles = cpu_tick(&agnes->cpu);
    if (cpu_cycles == 0) {
        return false;
    }

    // === OPTIMIZED APU ===
    apu_run_for(agnes, cpu_cycles);           // ← New batched function

    // === OPTIMIZED PPU ===
    ppu_run_for(&agnes->ppu, cpu_cycles * 3, out_new_frame);  // ← New batched function

    return true;
}

bool agnes_next_frame(agnes_t *agnes) {
    bool new_frame = false;
    while (!new_frame) {
        if (!agnes_tick(agnes, &new_frame)) {
            return false;
        }
    }
    return true;
}

agnes_color_t agnes_get_screen_pixel(const agnes_t *agnes, int x, int y) {
    int ix = (y * AGNES_SCREEN_WIDTH) + x;
    uint8_t color_ix = agnes->ppu.screen_buffer[ix];
    return g_colors[color_ix & 0x3f];
}

void agnes_destroy(agnes_t *agnes) {
    free(agnes);
}

static uint8_t get_input_byte(const agnes_input_t* input) {
    uint8_t res = 0;
    res |= input->a      << 0;
    res |= input->b      << 1;
    res |= input->select << 2;
    res |= input->start  << 3;
    res |= input->up     << 4;
    res |= input->down   << 5;
    res |= input->left   << 6;
    res |= input->right  << 7;
    return res;
}

//FILE_END
//FILE_START:cpu.c
#include <string.h>

static uint16_t cpu_read16_indirect_bug(cpu_t *cpu, uint16_t addr);
static uint16_t get_instruction_operand(cpu_t *cpu, addr_mode_t mode, bool *out_pages_differ);
static int handle_interrupt(cpu_t *cpu);
static bool check_pages_differ(uint16_t a, uint16_t b);

void cpu_init(cpu_t *cpu, agnes_t *agnes) {
    apu_init(agnes);
    memset(cpu, 0, sizeof(cpu_t));
    cpu->agnes = agnes;
    cpu->pc = cpu_read16(cpu, 0xfffc); // RESET
    cpu->sp = 0xfd;
    cpu_restore_flags(cpu, 0x24);
}

int cpu_tick(cpu_t *cpu) {
    if (cpu->stall > 0) {
        cpu->stall--;
        return 1;
    }

    int cycles = 0;

    if (cpu->interrupt != INTERRPUT_NONE) {
        cycles += handle_interrupt(cpu);
    }
    // --- Custom CDL HOOK START ---
    // 1. Turn ON the flag right before reading the opcode byte
    cpu->is_fetching_instruction = true;

    uint8_t opcode = cpu_read8(cpu, cpu->pc);

    // 2. Turn OFF the flag immediately after.
    cpu->is_fetching_instruction = false;
    // --- Custom CDL HOOK END ---

    instruction_t *ins = instruction_get(opcode);
    if (ins->operation == NULL) {
        return 0;
    }

    uint8_t ins_size = instruction_get_size(ins->mode);
    bool page_crossed = false;
    uint16_t addr = get_instruction_operand(cpu, ins->mode, &page_crossed);

    cpu->pc += ins_size;

    cycles += ins->cycles;
    cycles += ins->operation(cpu, addr, ins->mode);

    if (page_crossed && ins->page_cross_cycle) {
        cycles += 1;
    }

    cpu->cycles += cycles;

    return cycles;
}

void cpu_update_zn_flags(cpu_t *cpu, uint8_t val) {
    cpu->flag_zero = val == 0;
    cpu->flag_negative = AGNES_GET_BIT(val, 7);
}

void cpu_stack_push8(cpu_t *cpu, uint8_t val) {
    uint16_t addr = 0x0100 + (uint16_t)(cpu->sp);
    cpu_write8(cpu, addr, val);
    cpu->sp--;
}

void cpu_stack_push16(cpu_t *cpu, uint16_t val) {
    cpu_stack_push8(cpu, val >> 8);
    cpu_stack_push8(cpu, val);
}

uint8_t cpu_stack_pop8(cpu_t *cpu) {
    cpu->sp++;
    uint16_t addr = 0x0100 + (uint16_t)(cpu->sp);
    uint8_t res = cpu_read8(cpu, addr);
    return res;
}

uint16_t cpu_stack_pop16(cpu_t *cpu) {
    uint16_t lo = cpu_stack_pop8(cpu);
    uint16_t hi = cpu_stack_pop8(cpu);
    uint16_t res = (hi << 8) | lo;
    return res;
}

uint8_t cpu_get_flags(const cpu_t *cpu) {
    uint8_t res = 0;
    res |= cpu->flag_carry         << 0;
    res |= cpu->flag_zero          << 1;
    res |= cpu->flag_dis_interrupt << 2;
    res |= cpu->flag_decimal       << 3;
    res |= cpu->flag_overflow      << 6;
    res |= cpu->flag_negative      << 7;
    return res;
}

void cpu_restore_flags(cpu_t *cpu, uint8_t flags) {
    cpu->flag_carry         = AGNES_GET_BIT(flags, 0);
    cpu->flag_zero          = AGNES_GET_BIT(flags, 1);
    cpu->flag_dis_interrupt = AGNES_GET_BIT(flags, 2);
    cpu->flag_decimal       = AGNES_GET_BIT(flags, 3);
    cpu->flag_overflow      = AGNES_GET_BIT(flags, 6);
    cpu->flag_negative      = AGNES_GET_BIT(flags, 7);
}

void cpu_trigger_nmi(cpu_t *cpu) {
    cpu->interrupt = INTERRUPT_NMI;
}

void cpu_trigger_irq(cpu_t *cpu) {
    if (!cpu->flag_dis_interrupt) {
        cpu->interrupt = INTERRUPT_IRQ;
    }
}

void cpu_set_dma_stall(cpu_t *cpu) {
    cpu->stall = (cpu->cycles & 0x1) ? 514 : 513;
}

void cpu_write8(cpu_t *cpu, uint16_t addr, uint8_t val) {
    agnes_t *agnes = cpu->agnes;

    if (addr < 0x2000) {
        agnes->ram[addr & 0x7ff] = val;
    } else if (addr < 0x4000) {
        ppu_write_register(&agnes->ppu, 0x2000 | (addr & 0x7), val);
    } else if (addr == 0x4014) {
        ppu_write_register(&agnes->ppu, 0x4014, val);
    } else if (addr == 0x4016) {
        agnes->controllers_latch = val & 0x1;
        if (agnes->controllers_latch) {
            agnes->controllers[0].shift = agnes->controllers[0].state;
            agnes->controllers[1].shift = agnes->controllers[1].state;
        }
    } else if (addr < 0x4018) { // apu and io
        apu_write(agnes, addr, val);
    } else if (addr < 0x4020) { // disabled

    } else {
        mapper_write(agnes, addr, val);
    }
}

// Custom CDL
void cdl_log_byte(agnes_t *agnes, int rom_index, uint8_t flag) {
    if (agnes->cdl_buffer != NULL && rom_index >= 0 && rom_index < agnes->cdl_size) {
        agnes->cdl_buffer[rom_index] |= flag;
    }
}

uint8_t cpu_read8(cpu_t *cpu, uint16_t addr) {
    agnes_t *agnes = cpu->agnes;

    uint8_t res = 0;
    if (addr >= 0x4020) { // moved to top because it's the most common case
        res = mapper_read(agnes, addr);
        // --- Custom CDL HOOK START ---
        // For simple Mapper 0 games, the NES ROM starts mapping at CPU address 0x8000
        if (addr >= 0x8000) {
            int rom_index = addr - 0x8000; // For Mapper 0
            uint8_t flag;
            if (cpu->is_fetching_instruction) {
                flag = 0x01; // CODE
            } else if (cpu->is_apu_fetching_audio) {
                flag = 0x04; // AUDIO (DMC Fetch)
            } else {
                flag = 0x02; // DATA
            }

            cdl_log_byte(agnes, rom_index, flag);
        }
        // --- Custom CDL HOOK END ---
    } else if (addr < 0x2000) {
        res = agnes->ram[addr & 0x7ff];
    } else if (addr < 0x4000) {
        res = ppu_read_register(&agnes->ppu, 0x2000 | (addr & 0x7));
    } else if (addr < 0x4016) {
        // apu
    } else if (addr < 0x4018) {
        int controller = addr & 0x1; // 0: 0x4016, 1: 0x4017
        if (agnes->controllers_latch) {
            agnes->controllers[controller].shift = agnes->controllers[controller].state;
        }
        res = agnes->controllers[controller].shift & 0x1;
        agnes->controllers[controller].shift >>= 1;
    }

    if (agnes->num_cheats > 0) {
        for (int i = 0; i < agnes->num_cheats; i++) {
            if (agnes->cheats[i].enabled && agnes->cheats[i].address == addr) {
                if (!agnes->cheats[i].has_compare || res == agnes->cheats[i].compare) {
                    res = agnes->cheats[i].value;
                }
            }
        }
    }

    return res;
}

uint16_t cpu_read16(cpu_t *cpu, uint16_t addr) {
    uint8_t lo = cpu_read8(cpu, addr);
    uint8_t hi = cpu_read8(cpu, addr + 1);
    return (hi << 8) | lo;
}

static uint16_t cpu_read16_indirect_bug(cpu_t *cpu, uint16_t addr) {
    uint8_t lo = cpu_read8(cpu, addr);
    uint8_t hi = cpu_read8(cpu, (addr & 0xff00) | ((addr + 1) & 0x00ff));
    return (hi << 8) | lo;
}

static uint16_t get_instruction_operand(cpu_t *cpu, addr_mode_t mode, bool *out_pages_differ) {
    *out_pages_differ = false;
    switch (mode) {
        case ADDR_MODE_ABSOLUTE: {
            return cpu_read16(cpu, cpu->pc + 1);
        }
        case ADDR_MODE_ABSOLUTE_X: {
            uint16_t addr = cpu_read16(cpu, cpu->pc + 1);
            uint16_t res = addr + cpu->x;
            *out_pages_differ = check_pages_differ(addr, res);
            return res;
        }
        case ADDR_MODE_ABSOLUTE_Y: {
            uint16_t addr = cpu_read16(cpu, cpu->pc + 1);
            uint16_t res = addr + cpu->y;
            *out_pages_differ = check_pages_differ(addr, res);
            return res;
        }
        case ADDR_MODE_IMMEDIATE: {
            return cpu->pc + 1;
        }
        case ADDR_MODE_INDIRECT: {
            uint16_t addr = cpu_read16(cpu, cpu->pc + 1);
            return cpu_read16_indirect_bug(cpu, addr);
        }
        case ADDR_MODE_INDIRECT_X: {
            uint8_t addr = cpu_read8(cpu, (cpu->pc + 1));
            return cpu_read16_indirect_bug(cpu, (addr + cpu->x) & 0xff);
        }
        case ADDR_MODE_INDIRECT_Y: {
            uint8_t arg = cpu_read8(cpu, cpu->pc + 1);
            uint16_t addr2 = cpu_read16_indirect_bug(cpu, arg);
            uint16_t res = addr2 + cpu->y;
            *out_pages_differ = check_pages_differ(addr2, res);
            return res;
        }
        case ADDR_MODE_ZERO_PAGE: {
            return cpu_read8(cpu, cpu->pc + 1);
        }
        case ADDR_MODE_ZERO_PAGE_X: {
            return (cpu_read8(cpu, cpu->pc + 1) + cpu->x) & 0xff;
        }
        case ADDR_MODE_ZERO_PAGE_Y: {
            return (cpu_read8(cpu, cpu->pc + 1) + cpu->y) & 0xff;
        }
        case ADDR_MODE_RELATIVE: {
            uint8_t addr = cpu_read8(cpu, cpu->pc + 1);
            if (addr < 0x80) {
                return cpu->pc + addr + 2;
            } else {
                return cpu->pc + addr + 2 - 0x100;
            }
        }
        default: {
            return 0;
        }
    }
}

static int handle_interrupt(cpu_t *cpu) {
    uint16_t addr = 0;
    if (cpu->interrupt == INTERRUPT_NMI) {
        addr = 0xfffa;
    } else if (cpu->interrupt == INTERRUPT_IRQ) {
        addr = 0xfffe;
    } else {
        return 0;
    }
    cpu->interrupt = INTERRPUT_NONE;
    cpu_stack_push16(cpu, cpu->pc);
    uint8_t flags = cpu_get_flags(cpu);
    cpu_stack_push8(cpu, flags | 0x20);
    cpu->pc = cpu_read16(cpu, addr);
    cpu->flag_dis_interrupt = true;
    return 7;
}

static bool check_pages_differ(uint16_t a, uint16_t b) {
    return (0xff00 & a) != (0xff00 & b);
}
//FILE_END
//FILE_START:ppu.c
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

static void scanline_visible_pre(ppu_t *ppu, bool *out_new_frame);
static void inc_hori_v(ppu_t *ppu);
static void inc_vert_v(ppu_t *ppu);
static void emit_pixel(ppu_t *ppu);
static uint16_t get_bg_color_addr(ppu_t *ppu);
static uint16_t get_sprite_color_addr(ppu_t *ppu, int *out_sprite_ix, bool *out_behind_bg);
static void eval_sprites(ppu_t *ppu);
static void set_pixel_color_ix(ppu_t *ppu, int x, int y, uint8_t color_ix);
static uint8_t ppu_read8(ppu_t *ppu, uint16_t addr);
static void ppu_write8(ppu_t *ppu, uint16_t addr, uint8_t val);
static uint16_t mirror_address(ppu_t *ppu, uint16_t addr);

static unsigned g_palette_addr_map[32] = {
    0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
    0x00, 0x11, 0x12, 0x13, 0x04, 0x15, 0x16, 0x17, 0x08, 0x19, 0x1a, 0x1b, 0x0c, 0x1d, 0x1e, 0x1f,
};

void ppu_init(ppu_t *ppu, agnes_t *agnes) {
    memset(ppu, 0, sizeof(ppu_t));
    ppu->agnes = agnes;

    ppu_write_register(ppu, 0x2000, 0);
    ppu_write_register(ppu, 0x2001, 0);
}

void ppu_tick(ppu_t *ppu, bool *out_new_frame) {
    bool rendering_enabled = ppu->masks.show_background || ppu->masks.show_sprites;

    // https://wiki.nesdev.com/w/index.php/PPU_frame_timing#Even.2FOdd_Frames
    if (rendering_enabled && ppu->is_odd_frame && ppu->dot == 339 && ppu->scanline == 261) {
        ppu->dot = 0;
        ppu->scanline = 0;
        ppu->is_odd_frame = !ppu->is_odd_frame;
    } else {
        ppu->dot++;

        if (ppu->dot > 340){
            ppu->dot = 0;
            ppu->scanline++;
        }

        if (ppu->scanline > 261) {
            ppu->scanline = 0;
            ppu->is_odd_frame = !ppu->is_odd_frame;
        }
    }

    if (ppu->dot == 0) {
        return;
    }

    bool scanline_visible = ppu->scanline >= 0 && ppu->scanline < 240;
    bool scanline_pre = ppu->scanline == 261;
    bool scanline_post = ppu->scanline == 241;

    if (rendering_enabled && (scanline_visible || scanline_pre)) {
        scanline_visible_pre(ppu, out_new_frame);
    }

    if (ppu->dot == 1) {
        if (scanline_pre) {
            ppu->status.sprite_overflow = false;
            ppu->status.sprite_zero_hit = false;
            ppu->status.in_vblank = false;
        } else if (scanline_post) {
            ppu->status.in_vblank = true;
            *out_new_frame = true;
            if (ppu->ctrl.nmi_enabled) {
                cpu_trigger_nmi(&ppu->agnes->cpu);
            }
        }
    }
}

static void scanline_visible_pre(ppu_t *ppu, bool *out_new_frame) {
    bool scanline_visible = ppu->scanline >= 0 && ppu->scanline < 240;
    bool scanline_pre = ppu->scanline == 261;
    bool dot_visible = ppu->dot > 0 && ppu->dot <= 256;
    bool dot_fetch = ppu->dot <= 256 || (ppu->dot >= 321 && ppu->dot < 337);

    if (scanline_visible && dot_visible) {
        emit_pixel(ppu);
    }

    if (dot_fetch) {
        ppu->bg_lo_shift <<= 1;
        ppu->bg_hi_shift <<= 1;
        ppu->at_shift = (ppu->at_shift << 2) | (ppu->at_latch & 0x3);

        switch (ppu->dot & 0x7) {
            case 1: {
                uint16_t addr = 0x2000 | (ppu->regs.v & 0x0fff);
                ppu->nt = ppu_read8(ppu, addr);
                break;
            }
            case 3: {
                uint16_t v = ppu->regs.v;
                uint16_t addr = 0x23C0 | (v & 0x0C00) | ((v >> 4) & 0x38) | ((v >> 2) & 0x07);
                ppu->at = ppu_read8(ppu, addr);
                if (ppu->regs.v & 0x40) {
                    ppu->at = ppu->at >> 4;
                }
                if (ppu->regs.v & 0x02) {
                    ppu->at = ppu->at >> 2;
                }
                break;
            }
            case 5: {
                uint8_t fine_y = ((ppu->regs.v) >> 12) & 0x7;
                uint16_t addr = ppu->ctrl.bg_table_addr + (ppu->nt << 4) + fine_y;
                ppu->bg_lo = ppu_read8(ppu, addr);
                break;
            }
            case 7: {
                uint8_t fine_y = ((ppu->regs.v) >> 12) & 0x7;
                uint16_t addr = ppu->ctrl.bg_table_addr + (ppu->nt << 4) + fine_y + 8;
                ppu->bg_hi = ppu_read8(ppu, addr);
                break;
            }
            case 0: {
                ppu->bg_lo_shift = (ppu->bg_lo_shift & 0xff00) | ppu->bg_lo;
                ppu->bg_hi_shift = (ppu->bg_hi_shift & 0xff00) | ppu->bg_hi;

                ppu->at_latch = ppu->at & 0x3;

                if (ppu->dot == 256) {
                    inc_vert_v(ppu);
                } else {
                    inc_hori_v(ppu);
                }
                break;
            }
            default:
                break;
        }
    }

    if (ppu->dot == 257) {
        // v: |_...|.F..| |...E|DCBA| = t: |_...|.F..| |...E|DCBA|
        ppu->regs.v = (ppu->regs.v & 0xfbe0) | (ppu->regs.t & ~(0xfbe0));

        if (scanline_visible) {
            eval_sprites(ppu);
        } else {
            ppu->sprite_ixs_count = 0;
        }
    }

    if (scanline_pre && ppu->dot >= 280 && ppu->dot <= 304) {
        // v: |_IHG|F.ED| |CBA.|....| = t: |_IHG|F.ED| |CBA.|....|
        ppu->regs.v = (ppu->regs.v & 0x841f) | (ppu->regs.t & ~(0x841f));
    }

    if (ppu->masks.show_background && ppu->masks.show_sprites) {
        if ((ppu->ctrl.bg_table_addr == 0x0000 && ppu->dot == 270) // Should be 260 but it caused glitches in Kirby
         || (ppu->ctrl.bg_table_addr == 0x1000 && ppu->dot == 324)) { // Not tested so far.
            // https://wiki.nesdev.com/w/index.php/MMC3#IRQ_Specifics
            // PA12 is 12th bit of PPU address bus that's toggled when switching between
            // background and sprite pattern tables (should happen once per scanline).
            // This might not work correctly with games using 8x16 sprites
            // or games writing to CHR RAM.
            mapper_pa12_rising_edge(ppu->agnes);
        }
    }
}

#define GET_COARSE_X(v) ((v) & 0x1f)
#define SET_COARSE_X(v, cx) do { v = (((v) & ~0x1f) | ((cx) & 0x1f)); } while (0)
#define GET_COARSE_Y(v) (((v) >> 5) & 0x1f)
#define SET_COARSE_Y(v, cy) do { v = (((v) & ~0x3e0) | ((cy) & 0x1f) << 5); } while (0)
#define GET_FINE_Y(v) ((v) >> 12)
#define SET_FINE_Y(v, fy) do { v = (((v) & ~0x7000) | (((fy) & 0x7) << 12)); } while (0)

static void inc_hori_v(ppu_t *ppu) {
    unsigned cx = GET_COARSE_X(ppu->regs.v);
    if (cx == 31) {
        SET_COARSE_X(ppu->regs.v, 0);
        ppu->regs.v ^= 0x0400; // switch horizontal nametable
    } else {
        SET_COARSE_X(ppu->regs.v, cx + 1);
    }
}

static void inc_vert_v(ppu_t *ppu) {
    unsigned fy = GET_FINE_Y(ppu->regs.v);
    if (fy < 7) {
        SET_FINE_Y(ppu->regs.v, fy + 1);
    } else {
        SET_FINE_Y(ppu->regs.v, 0);
        unsigned cy = GET_COARSE_Y(ppu->regs.v);
        if (cy == 29) {
            SET_COARSE_Y(ppu->regs.v, 0);
            ppu->regs.v ^= 0x0800; // switch vertical nametable
        } else if (cy == 31) {
            SET_COARSE_Y(ppu->regs.v, 0);
        } else {
            SET_COARSE_Y(ppu->regs.v, cy + 1);
        }
    }
}

#undef GET_COARSE_X
#undef SET_COARSE_X
#undef GET_COARSE_Y
#undef SET_COARSE_Y
#undef GET_FINE_Y
#undef SET_FINE_Y

static void eval_sprites(ppu_t *ppu) {
    ppu->sprite_ixs_count = 0;
    const sprite_t* sprites = (const sprite_t*)ppu->oam_data;
    int sprite_height = ppu->ctrl.use_8x16_sprites ? 16 : 8;
    for (int i = 0; i < 64; i++) {
        const sprite_t* sprite = &sprites[i];

        if (sprite->y_pos > 0xef || sprite->x_pos > 0xff) {
            continue;
        }

        int s_y = ppu->scanline - sprite->y_pos;
        if (s_y < 0 || s_y >= sprite_height) {
            continue;
        }

        if (ppu->sprite_ixs_count < 8) {
            ppu->sprites[ppu->sprite_ixs_count] = *sprite;
            ppu->sprite_ixs[ppu->sprite_ixs_count] = i;
            ppu->sprite_ixs_count++;
        } else {
            ppu->status.sprite_overflow = true;
            break;
        }
    }
}

static void emit_pixel(ppu_t *ppu) {
    const int x = ppu->dot - 1;
    const int y = ppu->scanline;

    if (x < 8 && !ppu->masks.show_leftmost_bg && !ppu->masks.show_leftmost_sprites) {
        set_pixel_color_ix(ppu, x, y, 63); // 63 is black in my default colour palette
        return;
    }

    uint16_t bg_color_addr = get_bg_color_addr(ppu);

    int sprite_ix = -1;
    bool behind_bg = false;
    uint16_t sp_color_addr = get_sprite_color_addr(ppu, &sprite_ix, &behind_bg);

    uint16_t color_addr = 0x3f00;
    if (bg_color_addr && sp_color_addr) {
        if (sprite_ix == 0 && x != 255) {
            ppu->status.sprite_zero_hit = true;
        }
        color_addr = behind_bg ? bg_color_addr : sp_color_addr;
    } else if (bg_color_addr && !sp_color_addr) {
        color_addr = bg_color_addr;
    } else if (!bg_color_addr && sp_color_addr) {
        color_addr = sp_color_addr;
    }

    uint8_t output_color_ix = ppu_read8(ppu, color_addr);
    set_pixel_color_ix(ppu, x, y, output_color_ix);
}

static uint16_t get_bg_color_addr(ppu_t *ppu) {
    if (!ppu->masks.show_background || (!ppu->masks.show_leftmost_bg && ppu->dot < 9)) {
        return 0;
    }

    bool hi_bit = AGNES_GET_BIT(ppu->bg_hi_shift, 15 - ppu->regs.x);
    bool lo_bit = AGNES_GET_BIT(ppu->bg_lo_shift, 15 - ppu->regs.x);

    if (!lo_bit && !hi_bit) {
        return 0;
    }

    uint8_t palette = (ppu->at_shift >> (14 - (ppu->regs.x << 1)) & 0x3);
    uint8_t palette_ix = ((uint8_t)hi_bit << 1) | (uint8_t)lo_bit;
    uint16_t color_address = 0x3f00 | (palette << 2) | palette_ix;
    return color_address;
}

static uint16_t get_sprite_color_addr(ppu_t *ppu, int *out_sprite_ix, bool *out_behind_bg) {
    *out_sprite_ix = -1;
    *out_behind_bg = false;

    const int x = ppu->dot - 1;
    const int y = ppu->scanline;

    if (!ppu->masks.show_sprites || (!ppu->masks.show_leftmost_sprites && x < 8)) {
        return 0;
    }

    int sprite_height = ppu->ctrl.use_8x16_sprites ? 16 : 8;
    uint16_t table = ppu->ctrl.sprite_table_addr;

    for (int i = 0; i < ppu->sprite_ixs_count; i++) {
        const sprite_t *sprite = &ppu->sprites[i];
        int s_x = x - sprite->x_pos;
        if (s_x < 0 || s_x >= 8) {
            continue;
        }

        int s_y = y - sprite->y_pos - 1;

        s_x = AGNES_GET_BIT(sprite->attrs, 6) ? 7 - s_x : s_x; // flip hor
        s_y = AGNES_GET_BIT(sprite->attrs, 7) ? (sprite_height - 1 - s_y) : s_y; // flip vert

        uint8_t tile_num = sprite->tile_num;
        if (ppu->ctrl.use_8x16_sprites) {
            table = tile_num & 0x1 ? 0x1000 : 0x0000;
            tile_num &= 0xfe;
            if (s_y >= 8) {
                tile_num += 1;
                s_y -= 8;
            }
        }

        uint16_t offset = table + (tile_num << 4) + s_y;

        uint8_t lo_byte = ppu_read8(ppu, offset);
        uint8_t hi_byte = ppu_read8(ppu, offset + 8);

        if (!lo_byte && !hi_byte) {
            continue;
        }

        bool lo_bit = AGNES_GET_BIT(lo_byte, 7 - s_x);
        bool hi_bit = AGNES_GET_BIT(hi_byte, 7 - s_x);

        if (lo_bit || hi_bit) {
            *out_sprite_ix = ppu->sprite_ixs[i];
            if (AGNES_GET_BIT(sprite->attrs, 5)) {
                *out_behind_bg = true;
            }
            uint8_t palette_ix = ((uint8_t)hi_bit << 1) | (uint8_t)lo_bit;
            uint16_t color_address = 0x3f10 | ((sprite->attrs & 0x3) << 2) | palette_ix;
            return color_address;
        }
    }
    return 0;
}

uint8_t ppu_read_register(ppu_t *ppu, uint16_t addr) {
    switch (addr) {
        case 0x2002: { // PPUSTATUS
            uint8_t res = 0;
            res |= ppu->last_reg_write & 0x1f;
            res |= ppu->status.sprite_overflow << 5;
            res |= ppu->status.sprite_zero_hit << 6;
            res |= ppu->status.in_vblank << 7;
            ppu->status.in_vblank = false;
            //    res |= ppu->status_in_vblank
            //    w:                  = 0
            ppu->regs.w = 0;
            return res;
        }
        case 0x2004: { // OAMDATA
            return ppu->oam_data[ppu->oam_address];
        }
        case 0x2007: { // PPUDATA
            uint8_t res = 0;
            if (ppu->regs.v < 0x3f00) {
                res = ppu->ppudata_buffer;
                ppu->ppudata_buffer = ppu_read8(ppu, ppu->regs.v);
            } else {
                res = ppu_read8(ppu, ppu->regs.v);
                ppu->ppudata_buffer = ppu_read8(ppu, ppu->regs.v - 0x1000);
            }
            ppu->regs.v += ppu->ctrl.addr_increment;
            return res;
        }
    }
    return 0;
}

void ppu_write_register(ppu_t *ppu, uint16_t addr, uint8_t val) {
    ppu->last_reg_write = val;
    switch (addr) {
        case 0x2000: { // PPUCTRL
            ppu->ctrl.addr_increment = AGNES_GET_BIT(val, 2) ? 32 : 1;
            ppu->ctrl.sprite_table_addr = AGNES_GET_BIT(val, 3) ? 0x1000 : 0x0000;
            ppu->ctrl.bg_table_addr = AGNES_GET_BIT(val, 4) ? 0x1000 : 0x0000;
            ppu->ctrl.use_8x16_sprites = AGNES_GET_BIT(val, 5);
            ppu->ctrl.nmi_enabled = AGNES_GET_BIT(val, 7);

            //    t: |_...|BA..| |....|....| = d: |....|..BA|
            ppu->regs.t = (ppu->regs.t & 0xf3ff) | ((val & 0x03) << 10);
            break;
        }
        case 0x2001: { // PPUMASK
            ppu->masks.show_leftmost_bg = AGNES_GET_BIT(val, 1);
            ppu->masks.show_leftmost_sprites = AGNES_GET_BIT(val, 2);
            ppu->masks.show_background = AGNES_GET_BIT(val, 3);
            ppu->masks.show_sprites = AGNES_GET_BIT(val, 4);
            break;
        }
        case 0x2003: { // OAMADDR
            ppu->oam_address = val;
            break;
        }
        case 0x2004: { // OAMDATA
            ppu->oam_data[ppu->oam_address] = val;
            ppu->oam_address++;
            break;
        }
        case 0x2005: { // SCROLL
            if (ppu->regs.w) {
                //    t: |_CBA|..HG| |FED.|....| = d: |HGFE|DCBA|
                //    w:                  = 0
                ppu->regs.t = (ppu->regs.t & 0x8fff) | ((val & 0x7) << 12);
                ppu->regs.t = (ppu->regs.t & 0xfc1f) | ((val >> 3) << 5);
                ppu->regs.w = 0;
            } else {
                //    t: |_...|....| |...H|GFED| = d: HGFED...
                //    x:              CBA = d: |...|..CBA|
                //    w:                  = 1
                ppu->regs.t = (ppu->regs.t & 0xffe0) | (val >> 3);
                ppu->regs.x = (val & 0x7);
                ppu->regs.w = 1;
            }
            break;
        }
        case 0x2006: { // PPUADDR
            if (ppu->regs.w) {
                //    t: |_...|....| |HGFE|DCBA| = d: |HGFE|DCBA|
                //    v                   = t
                //    w:                  = 0
                ppu->regs.t = (ppu->regs.t & 0xff00) | val;
                ppu->regs.v = ppu->regs.t;
                ppu->regs.w = 0;
            } else {
                //    t: |_.FE|DCBA| |....|....| = d: |..FE|DCBA|
                //    t: |_X..|....| |....|....| = 0
                //    w:                  = 1
                ppu->regs.t = (ppu->regs.t & 0xc0ff) | ((val & 0x3f) << 8);
                ppu->regs.t = ppu->regs.t & 0xbfff;
                ppu->regs.w = 1;
            }
            break;
        }
        case 0x2007: { // PPUDATA
            ppu_write8(ppu, ppu->regs.v, val);
            ppu->regs.v += ppu->ctrl.addr_increment;
            break;
        }
        case 0x4014: { // OAMDMA
            uint16_t dma_addr = ((uint16_t)val) << 8;
            for (int i = 0; i < 256; i++) {
                ppu->oam_data[ppu->oam_address] = cpu_read8(&ppu->agnes->cpu, dma_addr);
                ppu->oam_address++;
                dma_addr++;
            }
            cpu_set_dma_stall(&ppu->agnes->cpu);
            break;
        }
    }
}

static void set_pixel_color_ix(ppu_t *ppu, int x, int y, uint8_t color_ix) {
    int ix = (y * AGNES_SCREEN_WIDTH) + x;
    ppu->screen_buffer[ix] = color_ix;
}

static uint8_t ppu_read8(ppu_t *ppu, uint16_t addr) {
    addr = addr & 0x3fff;
    uint8_t res = 0;
    if (addr >= 0x3f00) { // $3F00 - $3FFF, palette reads are most common
        unsigned palette_ix = g_palette_addr_map[addr & 0x1f];
        res = ppu->palette[palette_ix];
    } else if (addr < 0x2000) { // $0000 - $1FFF
        res = mapper_read(ppu->agnes, addr);

        // --- Custom CDL PPU HOOK START ---
        // Skip past the entire PRG-ROM code chunk to find our sequential file offset index
        int prg_total_bytes = ppu->agnes->gamepack.prg_rom_banks_count * 16384;
        int chr_rom_index = prg_total_bytes + addr;

        // Mark strictly as DATA (0x02)
        cdl_log_byte(ppu->agnes, chr_rom_index, 0x02);
        // --- Custom CDL PPU HOOK END ---

    } else { // $2000 - $3EFF
        uint16_t mirrored_addr = mirror_address(ppu, addr);
        res = ppu->nametables[mirrored_addr];
    }
    return res;
}

static void ppu_write8(ppu_t *ppu, uint16_t addr, uint8_t val) {
    addr = addr & 0x3fff;
    if (addr >= 0x3f00) { // $3F00 - $3FFF
        int palette_ix = g_palette_addr_map[addr & 0x1f];
        ppu->palette[palette_ix] = val;
    } else if (addr < 0x2000) { // $0000 - $1FFF
        mapper_write(ppu->agnes, addr, val);
    } else { // $2000 - $3EFF
        uint16_t mirrored_addr = mirror_address(ppu, addr);
        ppu->nametables[mirrored_addr] = val;
    }
}

static uint16_t mirror_address(ppu_t *ppu, uint16_t addr) {
    switch (ppu->agnes->mirroring_mode)
    {
        case MIRRORING_MODE_HORIZONTAL:   return ((addr >> 1) & 0x400) | (addr & 0x3ff);
        case MIRRORING_MODE_VERTICAL:     return addr & 0x07ff;
        case MIRRORING_MODE_SINGLE_LOWER: return addr & 0x3ff;
        case MIRRORING_MODE_SINGLE_UPPER: return 0x400 | (addr & 0x3ff);
        case MIRRORING_MODE_FOUR_SCREEN:  return addr - 0x2000;
        default: return 0;
    }
}
//FILE_END
//FILE_START:instructions.c

static int op_adc(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_and(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_asl(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_bcc(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_bcs(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_beq(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_bit(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_bmi(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_bne(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_bpl(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_brk(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_bvc(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_bvs(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_clc(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_cld(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_cli(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_clv(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_cmp(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_cpx(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_cpy(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_dec(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_dex(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_dey(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_eor(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_inc(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_inx(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_iny(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_jmp(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_jsr(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_lda(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_ldx(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_ldy(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_lsr(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_nop(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_ora(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_pha(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_php(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_pla(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_plp(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_rol(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_ror(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_rti(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_rts(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_sbc(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_sec(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_sed(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_sei(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_sta(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_stx(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_sty(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_tax(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_tay(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_tsx(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_txa(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_txs(cpu_t *cpu, uint16_t addr, addr_mode_t mode);
static int op_tya(cpu_t *cpu, uint16_t addr, addr_mode_t mode);

static int take_branch(cpu_t *cpu, uint16_t addr);

#define INS(OPC, NAME, CYCLES, PCC, OP, MODE) { NAME, OPC, CYCLES, PCC, MODE, OP }
#define INE(OPC) { "ILL", OPC, 1, false, ADDR_MODE_IMPLIED, NULL }

static instruction_t instructions[256] = {
    INS(0x00, "BRK", 7, false, op_brk, ADDR_MODE_IMPLIED_BRK),
    INS(0x01, "ORA", 6, false, op_ora, ADDR_MODE_INDIRECT_X),
    INE(0x02),
    INE(0x03),
    INE(0x04),
    INS(0x05, "ORA", 3, false, op_ora, ADDR_MODE_ZERO_PAGE),
    INS(0x06, "ASL", 5, false, op_asl, ADDR_MODE_ZERO_PAGE),
    INE(0x07),
    INS(0x08, "PHP", 3, false, op_php, ADDR_MODE_IMPLIED),
    INS(0x09, "ORA", 2, false, op_ora, ADDR_MODE_IMMEDIATE),
    INS(0x0a, "ASL", 2, false, op_asl, ADDR_MODE_ACCUMULATOR),
    INE(0x0b),
    INE(0x0c),
    INS(0x0d, "ORA", 4, false, op_ora, ADDR_MODE_ABSOLUTE),
    INS(0x0e, "ASL", 6, false, op_asl, ADDR_MODE_ABSOLUTE),
    INE(0x0f),
    INS(0x10, "BPL", 2, true,  op_bpl, ADDR_MODE_RELATIVE),
    INS(0x11, "ORA", 5, true,  op_ora, ADDR_MODE_INDIRECT_Y),
    INE(0x12),
    INE(0x13),
    INE(0x14),
    INS(0x15, "ORA", 4, false, op_ora, ADDR_MODE_ZERO_PAGE_X),
    INS(0x16, "ASL", 6, false, op_asl, ADDR_MODE_ZERO_PAGE_X),
    INE(0x17),
    INS(0x18, "CLC", 2, false, op_clc, ADDR_MODE_IMPLIED),
    INS(0x19, "ORA", 4, true,  op_ora, ADDR_MODE_ABSOLUTE_Y),
    INE(0x1a),
    INE(0x1b),
    INE(0x1c),
    INS(0x1d, "ORA", 4, true,  op_ora, ADDR_MODE_ABSOLUTE_X),
    INS(0x1e, "ASL", 7, false, op_asl, ADDR_MODE_ABSOLUTE_X),
    INE(0x1f),
    INS(0x20, "JSR", 6, false, op_jsr, ADDR_MODE_ABSOLUTE),
    INS(0x21, "AND", 6, false, op_and, ADDR_MODE_INDIRECT_X),
    INE(0x22),
    INE(0x23),
    INS(0x24, "BIT", 3, false, op_bit, ADDR_MODE_ZERO_PAGE),
    INS(0x25, "AND", 3, false, op_and, ADDR_MODE_ZERO_PAGE),
    INS(0x26, "ROL", 5, false, op_rol, ADDR_MODE_ZERO_PAGE),
    INE(0x27),
    INS(0x28, "PLP", 4, false, op_plp, ADDR_MODE_IMPLIED),
    INS(0x29, "AND", 2, false, op_and, ADDR_MODE_IMMEDIATE),
    INS(0x2a, "ROL", 2, false, op_rol, ADDR_MODE_ACCUMULATOR),
    INE(0x2b),
    INS(0x2c, "BIT", 4, false, op_bit, ADDR_MODE_ABSOLUTE),
    INS(0x2d, "AND", 4, false, op_and, ADDR_MODE_ABSOLUTE),
    INS(0x2e, "ROL", 6, false, op_rol, ADDR_MODE_ABSOLUTE),
    INE(0x2f),
    INS(0x30, "BMI", 2, true,  op_bmi, ADDR_MODE_RELATIVE),
    INS(0x31, "AND", 5, true,  op_and, ADDR_MODE_INDIRECT_Y),
    INE(0x32),
    INE(0x33),
    INE(0x34),
    INS(0x35, "AND", 4, false, op_and, ADDR_MODE_ZERO_PAGE_X),
    INS(0x36, "ROL", 6, false, op_rol, ADDR_MODE_ZERO_PAGE_X),
    INE(0x37),
    INS(0x38, "SEC", 2, false, op_sec, ADDR_MODE_IMPLIED),
    INS(0x39, "AND", 4, true,  op_and, ADDR_MODE_ABSOLUTE_Y),
    INE(0x3a),
    INE(0x3b),
    INE(0x3c),
    INS(0x3d, "AND", 4, true,  op_and, ADDR_MODE_ABSOLUTE_X),
    INS(0x3e, "ROL", 7, false, op_rol, ADDR_MODE_ABSOLUTE_X),
    INE(0x3f),
    INS(0x40, "RTI", 6, false, op_rti, ADDR_MODE_IMPLIED),
    INS(0x41, "EOR", 6, false, op_eor, ADDR_MODE_INDIRECT_X),
    INE(0x42),
    INE(0x43),
    INE(0x44),
    INS(0x45, "EOR", 3, false, op_eor, ADDR_MODE_ZERO_PAGE),
    INS(0x46, "LSR", 5, false, op_lsr, ADDR_MODE_ZERO_PAGE),
    INE(0x47),
    INS(0x48, "PHA", 3, false, op_pha, ADDR_MODE_IMPLIED),
    INS(0x49, "EOR", 2, false, op_eor, ADDR_MODE_IMMEDIATE),
    INS(0x4a, "LSR", 2, false, op_lsr, ADDR_MODE_ACCUMULATOR),
    INE(0x4b),
    INS(0x4c, "JMP", 3, false, op_jmp, ADDR_MODE_ABSOLUTE),
    INS(0x4d, "EOR", 4, false, op_eor, ADDR_MODE_ABSOLUTE),
    INS(0x4e, "LSR", 6, false, op_lsr, ADDR_MODE_ABSOLUTE),
    INE(0x4f),
    INS(0x50, "BVC", 2, true,  op_bvc, ADDR_MODE_RELATIVE),
    INS(0x51, "EOR", 5, true,  op_eor, ADDR_MODE_INDIRECT_Y),
    INE(0x52),
    INE(0x53),
    INE(0x54),
    INS(0x55, "EOR", 4, false, op_eor, ADDR_MODE_ZERO_PAGE_X),
    INS(0x56, "LSR", 6, false, op_lsr, ADDR_MODE_ZERO_PAGE_X),
    INE(0x57),
    INS(0x58, "CLI", 2, false, op_cli, ADDR_MODE_IMPLIED),
    INS(0x59, "EOR", 4, true,  op_eor, ADDR_MODE_ABSOLUTE_Y),
    INE(0x5a),
    INE(0x5b),
    INE(0x5c),
    INS(0x5d, "EOR", 4, true,  op_eor, ADDR_MODE_ABSOLUTE_X),
    INS(0x5e, "LSR", 7, false, op_lsr, ADDR_MODE_ABSOLUTE_X),
    INE(0x5f),
    INS(0x60, "RTS", 6, false, op_rts, ADDR_MODE_IMPLIED),
    INS(0x61, "ADC", 6, false, op_adc, ADDR_MODE_INDIRECT_X),
    INE(0x62),
    INE(0x63),
    INE(0x64),
    INS(0x65, "ADC", 3, false, op_adc, ADDR_MODE_ZERO_PAGE),
    INS(0x66, "ROR", 5, false, op_ror, ADDR_MODE_ZERO_PAGE),
    INE(0x67),
    INS(0x68, "PLA", 4, false, op_pla, ADDR_MODE_IMPLIED),
    INS(0x69, "ADC", 2, false, op_adc, ADDR_MODE_IMMEDIATE),
    INS(0x6a, "ROR", 2, false, op_ror, ADDR_MODE_ACCUMULATOR),
    INE(0x6b),
    INS(0x6c, "JMP", 5, false, op_jmp, ADDR_MODE_INDIRECT),
    INS(0x6d, "ADC", 4, false,  op_adc, ADDR_MODE_ABSOLUTE),
    INS(0x6e, "ROR", 6, false, op_ror, ADDR_MODE_ABSOLUTE),
    INE(0x6f),
    INS(0x70, "BVS", 2, true,  op_bvs, ADDR_MODE_RELATIVE),
    INS(0x71, "ADC", 5, true,  op_adc, ADDR_MODE_INDIRECT_Y),
    INE(0x72),
    INE(0x73),
    INE(0x74),
    INS(0x75, "ADC", 4, false, op_adc, ADDR_MODE_ZERO_PAGE_X),
    INS(0x76, "ROR", 6, false, op_ror, ADDR_MODE_ZERO_PAGE_X),
    INE(0x77),
    INS(0x78, "SEI", 2, false, op_sei, ADDR_MODE_IMPLIED),
    INS(0x79, "ADC", 4, true,  op_adc, ADDR_MODE_ABSOLUTE_Y),
    INE(0x7a),
    INE(0x7b),
    INE(0x7c),
    INS(0x7d, "ADC", 4, true,  op_adc, ADDR_MODE_ABSOLUTE_X),
    INS(0x7e, "ROR", 7, false, op_ror, ADDR_MODE_ABSOLUTE_X),
    INE(0x7f),
    INE(0x80),
    INS(0x81, "STA", 6, false, op_sta, ADDR_MODE_INDIRECT_X),
    INE(0x82),
    INE(0x83),
    INS(0x84, "STY", 3, false, op_sty, ADDR_MODE_ZERO_PAGE),
    INS(0x85, "STA", 3, false, op_sta, ADDR_MODE_ZERO_PAGE),
    INS(0x86, "STX", 3, false, op_stx, ADDR_MODE_ZERO_PAGE),
    INE(0x87),
    INS(0x88, "DEY", 2, false, op_dey, ADDR_MODE_IMPLIED),
    INE(0x89),
    INS(0x8a, "TXA", 2, false, op_txa, ADDR_MODE_IMPLIED),
    INE(0x8b),
    INS(0x8c, "STY", 4, false, op_sty, ADDR_MODE_ABSOLUTE),
    INS(0x8d, "STA", 4, false, op_sta, ADDR_MODE_ABSOLUTE),
    INS(0x8e, "STX", 4, false, op_stx, ADDR_MODE_ABSOLUTE),
    INE(0x8f),
    INS(0x90, "BCC", 2, true,  op_bcc, ADDR_MODE_RELATIVE),
    INS(0x91, "STA", 6, false, op_sta, ADDR_MODE_INDIRECT_Y),
    INE(0x92),
    INE(0x93),
    INS(0x94, "STY", 4, false, op_sty, ADDR_MODE_ZERO_PAGE_X),
    INS(0x95, "STA", 4, false, op_sta, ADDR_MODE_ZERO_PAGE_X),
    INS(0x96, "STX", 4, false, op_stx, ADDR_MODE_ZERO_PAGE_Y),
    INE(0x97),
    INS(0x98, "TYA", 2, false, op_tya, ADDR_MODE_IMPLIED),
    INS(0x99, "STA", 5, false, op_sta, ADDR_MODE_ABSOLUTE_Y),
    INS(0x9a, "TXS", 2, false, op_txs, ADDR_MODE_IMPLIED),
    INE(0x9b),
    INE(0x9c),
    INS(0x9d, "STA", 5, false, op_sta, ADDR_MODE_ABSOLUTE_X),
    INE(0x9e),
    INE(0x9f),
    INS(0xa0, "LDY", 2, false, op_ldy, ADDR_MODE_IMMEDIATE),
    INS(0xa1, "LDA", 6, false, op_lda, ADDR_MODE_INDIRECT_X),
    INS(0xa2, "LDX", 2, false, op_ldx, ADDR_MODE_IMMEDIATE),
    INE(0xa3),
    INS(0xa4, "LDY", 3, false, op_ldy, ADDR_MODE_ZERO_PAGE),
    INS(0xa5, "LDA", 3, false, op_lda, ADDR_MODE_ZERO_PAGE),
    INS(0xa6, "LDX", 3, false, op_ldx, ADDR_MODE_ZERO_PAGE),
    INE(0xa7),
    INS(0xa8, "TAY", 2, false, op_tay, ADDR_MODE_IMPLIED),
    INS(0xa9, "LDA", 2, false, op_lda, ADDR_MODE_IMMEDIATE),
    INS(0xaa, "TAX", 2, false, op_tax, ADDR_MODE_IMPLIED),
    INE(0xab),
    INS(0xac, "LDY", 4, false, op_ldy, ADDR_MODE_ABSOLUTE),
    INS(0xad, "LDA", 4, false, op_lda, ADDR_MODE_ABSOLUTE),
    INS(0xae, "LDX", 4, false, op_ldx, ADDR_MODE_ABSOLUTE),
    INE(0xaf),
    INS(0xb0, "BCS", 2, true,  op_bcs, ADDR_MODE_RELATIVE),
    INS(0xb1, "LDA", 5, true,  op_lda, ADDR_MODE_INDIRECT_Y),
    INE(0xb2),
    INE(0xb3),
    INS(0xb4, "LDY", 4, false, op_ldy, ADDR_MODE_ZERO_PAGE_X),
    INS(0xb5, "LDA", 4, false, op_lda, ADDR_MODE_ZERO_PAGE_X),
    INS(0xb6, "LDX", 4, false, op_ldx, ADDR_MODE_ZERO_PAGE_Y),
    INE(0xb7),
    INS(0xb8, "CLV", 2, false, op_clv, ADDR_MODE_IMPLIED),
    INS(0xb9, "LDA", 4, true,  op_lda, ADDR_MODE_ABSOLUTE_Y),
    INS(0xba, "TSX", 2, false, op_tsx, ADDR_MODE_IMPLIED),
    INE(0xbb),
    INS(0xbc, "LDY", 4, true,  op_ldy, ADDR_MODE_ABSOLUTE_X),
    INS(0xbd, "LDA", 4, true,  op_lda, ADDR_MODE_ABSOLUTE_X),
    INS(0xbe, "LDX", 4, true,  op_ldx, ADDR_MODE_ABSOLUTE_Y),
    INE(0xbf),
    INS(0xc0, "CPY", 2, false, op_cpy, ADDR_MODE_IMMEDIATE),
    INS(0xc1, "CMP", 6, false, op_cmp, ADDR_MODE_INDIRECT_X),
    INE(0xc2),
    INE(0xc3),
    INS(0xc4, "CPY", 3, false, op_cpy, ADDR_MODE_ZERO_PAGE),
    INS(0xc5, "CMP", 3, false, op_cmp, ADDR_MODE_ZERO_PAGE),
    INS(0xc6, "DEC", 5, false, op_dec, ADDR_MODE_ZERO_PAGE),
    INE(0xc7),
    INS(0xc8, "INY", 2, false, op_iny, ADDR_MODE_IMPLIED),
    INS(0xc9, "CMP", 2, false, op_cmp, ADDR_MODE_IMMEDIATE),
    INS(0xca, "DEX", 2, false, op_dex, ADDR_MODE_IMPLIED),
    INE(0xcb),
    INS(0xcc, "CPY", 4, false, op_cpy, ADDR_MODE_ABSOLUTE),
    INS(0xcd, "CMP", 4, false, op_cmp, ADDR_MODE_ABSOLUTE),
    INS(0xce, "DEC", 6, false, op_dec, ADDR_MODE_ABSOLUTE),
    INE(0xcf),
    INS(0xd0, "BNE", 2, true,  op_bne, ADDR_MODE_RELATIVE),
    INS(0xd1, "CMP", 5, true,  op_cmp, ADDR_MODE_INDIRECT_Y),
    INE(0xd2),
    INE(0xd3),
    INE(0xd4),
    INS(0xd5, "CMP", 4, false, op_cmp, ADDR_MODE_ZERO_PAGE_X),
    INS(0xd6, "DEC", 6, false, op_dec, ADDR_MODE_ZERO_PAGE_X),
    INE(0xd7),
    INS(0xd8, "CLD", 2, false, op_cld, ADDR_MODE_IMPLIED),
    INS(0xd9, "CMP", 4, true,  op_cmp, ADDR_MODE_ABSOLUTE_Y),
    INE(0xda),
    INE(0xdb),
    INE(0xdc),
    INS(0xdd, "CMP", 4, true,  op_cmp, ADDR_MODE_ABSOLUTE_X),
    INS(0xde, "DEC", 7, false, op_dec, ADDR_MODE_ABSOLUTE_X),
    INE(0xdf),
    INS(0xe0, "CPX", 2, false, op_cpx, ADDR_MODE_IMMEDIATE),
    INS(0xe1, "SBC", 6, false, op_sbc, ADDR_MODE_INDIRECT_X),
    INE(0xe2),
    INE(0xe3),
    INS(0xe4, "CPX", 3, false, op_cpx, ADDR_MODE_ZERO_PAGE),
    INS(0xe5, "SBC", 3, false, op_sbc, ADDR_MODE_ZERO_PAGE),
    INS(0xe6, "INC", 5, false, op_inc, ADDR_MODE_ZERO_PAGE),
    INE(0xe7),
    INS(0xe8, "INX", 2, false, op_inx, ADDR_MODE_IMPLIED),
    INS(0xe9, "SBC", 2, false, op_sbc, ADDR_MODE_IMMEDIATE),
    INS(0xea, "NOP", 2, false, op_nop, ADDR_MODE_IMPLIED),
    INE(0xeb),
    INS(0xec, "CPX", 4, false, op_cpx, ADDR_MODE_ABSOLUTE),
    INS(0xed, "SBC", 4, false, op_sbc, ADDR_MODE_ABSOLUTE),
    INS(0xee, "INC", 6, false, op_inc, ADDR_MODE_ABSOLUTE),
    INE(0xef),
    INS(0xf0, "BEQ", 2, true,  op_beq, ADDR_MODE_RELATIVE),
    INS(0xf1, "SBC", 5, true,  op_sbc, ADDR_MODE_INDIRECT_Y),
    INE(0xf2),
    INE(0xf3),
    INE(0xf4),
    INS(0xf5, "SBC", 4, false, op_sbc, ADDR_MODE_ZERO_PAGE_X),
    INS(0xf6, "INC", 6, false, op_inc, ADDR_MODE_ZERO_PAGE_X),
    INE(0xf7),
    INS(0xf8, "SED", 2, false, op_sed, ADDR_MODE_IMPLIED),
    INS(0xf9, "SBC", 4, true,  op_sbc, ADDR_MODE_ABSOLUTE_Y),
    INE(0xfa),
    INE(0xfb),
    INE(0xfc),
    INS(0xfd, "SBC", 4, true,  op_sbc, ADDR_MODE_ABSOLUTE_X),
    INS(0xfe, "INC", 7, false, op_inc, ADDR_MODE_ABSOLUTE_X),
    INE(0xff),
};

#undef INE
#undef INS

instruction_t* instruction_get(uint8_t opc) {
    return &instructions[opc];
}

uint8_t instruction_get_size(addr_mode_t mode) {
    switch (mode) {
        case ADDR_MODE_NONE:        return 0;
        case ADDR_MODE_ABSOLUTE:    return 3;
        case ADDR_MODE_ABSOLUTE_X:  return 3;
        case ADDR_MODE_ABSOLUTE_Y:  return 3;
        case ADDR_MODE_ACCUMULATOR: return 1;
        case ADDR_MODE_IMMEDIATE:   return 2;
        case ADDR_MODE_IMPLIED:     return 1;
        case ADDR_MODE_IMPLIED_BRK: return 2;
        case ADDR_MODE_INDIRECT:    return 3;
        case ADDR_MODE_INDIRECT_X:  return 2;
        case ADDR_MODE_INDIRECT_Y:  return 2;
        case ADDR_MODE_RELATIVE:    return 2;
        case ADDR_MODE_ZERO_PAGE:   return 2;
        case ADDR_MODE_ZERO_PAGE_X: return 2;
        case ADDR_MODE_ZERO_PAGE_Y: return 2;
        default: return 0;
    }
}

static int op_adc(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    uint8_t old_acc = cpu->acc;
    uint8_t val = cpu_read8(cpu, addr);
    int res = cpu->acc + val + (uint8_t)cpu->flag_carry;
    cpu->acc = (uint8_t)res;
    cpu->flag_carry = res > 0xff;
    cpu->flag_overflow = !((old_acc ^ val) & 0x80) && ((old_acc ^ cpu->acc) & 0x80);
    cpu_update_zn_flags(cpu, cpu->acc);
    return 0;
}

static int op_and(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    uint8_t val = cpu_read8(cpu, addr);
    cpu->acc = cpu->acc & val;
    cpu_update_zn_flags(cpu, cpu->acc);
    return 0;
}

static int op_asl(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    if (mode == ADDR_MODE_ACCUMULATOR) {
        cpu->flag_carry = AGNES_GET_BIT(cpu->acc, 7);
        cpu->acc = cpu->acc << 1;
        cpu_update_zn_flags(cpu, cpu->acc);
    } else {
        uint8_t val = cpu_read8(cpu, addr);
        cpu->flag_carry = AGNES_GET_BIT(val, 7);
        val = val << 1;
        cpu_write8(cpu, addr, val);
        cpu_update_zn_flags(cpu, val);
    }
    return 0;
}

static int op_bcc(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    return !cpu->flag_carry ? take_branch(cpu, addr) : 0;
}

static int op_bcs(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    return cpu->flag_carry ? take_branch(cpu, addr) : 0;
}

static int op_beq(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    return cpu->flag_zero ? take_branch(cpu, addr) : 0;
}

static int op_bit(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    uint8_t val = cpu_read8(cpu, addr);
    uint8_t res = cpu->acc & val;
    cpu->flag_zero = res == 0;
    cpu->flag_overflow = AGNES_GET_BIT(val, 6);
    cpu->flag_negative = AGNES_GET_BIT(val, 7);
    return 0;
}

static int op_bmi(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    return cpu->flag_negative ? take_branch(cpu, addr) : 0;
}

static int op_bne(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    return !cpu->flag_zero ? take_branch(cpu, addr) : 0;
}

static int op_bpl(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    return !cpu->flag_negative ? take_branch(cpu, addr) : 0;
}

static int op_brk(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    cpu_stack_push16(cpu, cpu->pc);
    uint8_t flags = cpu_get_flags(cpu);
    cpu_stack_push8(cpu, flags | 0x30);
    cpu->pc = cpu_read16(cpu, 0xfffe);
    cpu->flag_dis_interrupt = true;
    return 0;
}

static int op_bvc(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    return !cpu->flag_overflow ? take_branch(cpu, addr) : 0;
}

static int op_bvs(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    return cpu->flag_overflow ? take_branch(cpu, addr) : 0;
}

static int op_clc(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    cpu->flag_carry = false;
    return 0;
}

static int op_cld(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    cpu->flag_decimal = false;
    return 0;
}

static int op_cli(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    cpu->flag_dis_interrupt = false;
    return 0;
}

static int op_clv(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    cpu->flag_overflow = false;
    return 0;
}

static int op_cmp(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    uint8_t val = cpu_read8(cpu, addr);
    cpu_update_zn_flags(cpu, cpu->acc - val);
    cpu->flag_carry = cpu->acc >= val;
    return 0;
}

static int op_cpx(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    uint8_t val = cpu_read8(cpu, addr);
    cpu_update_zn_flags(cpu, cpu->x - val);
    cpu->flag_carry = cpu->x >= val;
    return 0;
}

static int op_cpy(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    uint8_t val = cpu_read8(cpu, addr);
    cpu_update_zn_flags(cpu, cpu->y - val);
    cpu->flag_carry = cpu->y >= val;
    return 0;
}

static int op_dec(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    uint8_t val = cpu_read8(cpu, addr);
    cpu_write8(cpu, addr, val - 1);
    cpu_update_zn_flags(cpu, val - 1);
    return 0;
}

static int op_dex(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    cpu->x--;
    cpu_update_zn_flags(cpu, cpu->x);
    return 0;
}

static int op_dey(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    cpu->y--;
    cpu_update_zn_flags(cpu, cpu->y);
    return 0;
}

static int op_eor(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    uint8_t val = cpu_read8(cpu, addr);
    cpu->acc = cpu->acc ^ val;
    cpu_update_zn_flags(cpu, cpu->acc);
    return 0;
}

static int op_inc(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    uint8_t val = cpu_read8(cpu, addr);
    cpu_write8(cpu, addr, val + 1);
    cpu_update_zn_flags(cpu, val + 1);
    return 0;
}

static int op_inx(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    cpu->x++;
    cpu_update_zn_flags(cpu, cpu->x);
    return 0;
}

static int op_iny(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    cpu->y++;
    cpu_update_zn_flags(cpu, cpu->y);
    return 0;
}

static int op_jmp(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    cpu->pc = addr;
    return 0;
}

static int op_jsr(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    cpu_stack_push16(cpu, cpu->pc - 1);
    cpu->pc = addr;
    return 0;
}

static int op_lda(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    uint8_t val = cpu_read8(cpu, addr);
    cpu->acc = val;
    cpu_update_zn_flags(cpu, cpu->acc);
    return 0;
}

static int op_ldx(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    uint8_t val = cpu_read8(cpu, addr);
    cpu->x = val;
    cpu_update_zn_flags(cpu, cpu->x);
    return 0;
}

static int op_ldy(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    uint8_t val = cpu_read8(cpu, addr);
    cpu->y = val;
    cpu_update_zn_flags(cpu, cpu->y);
    return 0;
}

static int op_lsr(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    if (mode == ADDR_MODE_ACCUMULATOR) {
        cpu->flag_carry = AGNES_GET_BIT(cpu->acc, 0);
        cpu->acc = cpu->acc >> 1;
        cpu_update_zn_flags(cpu, cpu->acc);
    } else {
        uint8_t val = cpu_read8(cpu, addr);
        cpu->flag_carry = AGNES_GET_BIT(val, 0);
        val = val >> 1;
        cpu_write8(cpu, addr, val);
        cpu_update_zn_flags(cpu, val);
    }
    return 0;
}

static int op_nop(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    return 0;
}

static int op_ora(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    uint8_t val = cpu_read8(cpu, addr);
    cpu->acc = cpu->acc | val;
    cpu_update_zn_flags(cpu, cpu->acc);
    return 0;
}

static int op_pha(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    cpu_stack_push8(cpu, cpu->acc);
    return 0;
}

static int op_php(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    uint8_t flags = cpu_get_flags(cpu);
    cpu_stack_push8(cpu, flags | 0x30);
    return 0;
}

static int op_pla(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    cpu->acc = cpu_stack_pop8(cpu);
    cpu_update_zn_flags(cpu, cpu->acc);
    return 0;
}

static int op_plp(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    uint8_t flags = cpu_stack_pop8(cpu);
    cpu_restore_flags(cpu, flags);
    return 0;
}

static int op_rol(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    uint8_t old_carry = cpu->flag_carry;
    if (mode == ADDR_MODE_ACCUMULATOR) {
        cpu->flag_carry = AGNES_GET_BIT(cpu->acc, 7);
        cpu->acc = (cpu->acc << 1) | old_carry;
        cpu_update_zn_flags(cpu, cpu->acc);
    } else {
        uint8_t val = cpu_read8(cpu, addr);
        cpu->flag_carry = AGNES_GET_BIT(val, 7);
        val = (val << 1) | old_carry;
        cpu_write8(cpu, addr, val);
        cpu_update_zn_flags(cpu, val);
    }
    return 0;
}

static int op_ror(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    uint8_t old_carry = cpu->flag_carry;
    if (mode == ADDR_MODE_ACCUMULATOR) {
        cpu->flag_carry = AGNES_GET_BIT(cpu->acc, 0);
        cpu->acc = (cpu->acc >> 1) | (old_carry << 7);
        cpu_update_zn_flags(cpu, cpu->acc);
    } else {
        uint8_t val = cpu_read8(cpu, addr);
        cpu->flag_carry = AGNES_GET_BIT(val, 0);
        val = (val >> 1) | (old_carry << 7);
        cpu_write8(cpu, addr, val);
        cpu_update_zn_flags(cpu, val);
    }
    return 0;
}

static int op_rti(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    uint8_t flags = cpu_stack_pop8(cpu);
    cpu_restore_flags(cpu, flags);
    cpu->pc = cpu_stack_pop16(cpu);
    return 0;
}

static int op_rts(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    cpu->pc = cpu_stack_pop16(cpu) + 1;
    return 0;
}

static int op_sbc(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    uint8_t val = cpu_read8(cpu, addr);
    uint8_t old_acc = cpu->acc;
    int res = cpu->acc - val - (cpu->flag_carry ? 0 : 1);
    cpu->acc = (uint8_t)res;
    cpu_update_zn_flags(cpu, cpu->acc);
    cpu->flag_carry = res >= 0;
    cpu->flag_overflow = ((old_acc ^ val) & 0x80) && ((old_acc ^ cpu->acc) & 0x80);
    return 0;
}

static int op_sec(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    cpu->flag_carry = true;
    return 0;
}

static int op_sed(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    cpu->flag_decimal = true;
    return 0;
}

static int op_sei(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    cpu->flag_dis_interrupt = true;
    return 0;
}

static int op_sta(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    cpu_write8(cpu, addr, cpu->acc);
    return 0;
}

static int op_stx(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    cpu_write8(cpu, addr, cpu->x);
    return 0;
}

static int op_sty(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    cpu_write8(cpu, addr, cpu->y);
    return 0;
}

static int op_tax(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    cpu->x = cpu->acc;
    cpu_update_zn_flags(cpu, cpu->x);
    return 0;
}

static int op_tay(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    cpu->y = cpu->acc;
    cpu_update_zn_flags(cpu, cpu->y);
    return 0;
}

static int op_tsx(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    cpu->x = cpu->sp;
    cpu_update_zn_flags(cpu, cpu->x);
    return 0;
}

static int op_txa(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    cpu->acc = cpu->x;
    cpu_update_zn_flags(cpu, cpu->acc);
    return 0;
}

static int op_txs(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    cpu->sp = cpu->x;
    return 0;
}

static int op_tya(cpu_t *cpu, uint16_t addr, addr_mode_t mode) {
    cpu->acc = cpu->y;
    cpu_update_zn_flags(cpu, cpu->acc);
    return 0;
}

static int take_branch(cpu_t *cpu, uint16_t addr) {
    bool page_crossed = (cpu->pc & 0xff00) != (addr & 0xff00);
    cpu->pc = addr;
    return page_crossed ? 2 : 1;
}
//FILE_END
//FILE_START:mapper.c

bool mapper_init(agnes_t *agnes) {
    switch (agnes->gamepack.mapper) {
        case 0: mapper0_init(&agnes->mapper.m0, agnes); return true;
        case 1: mapper1_init(&agnes->mapper.m1, agnes); return true;
        case 2: mapper2_init(&agnes->mapper.m2, agnes); return true;
        case 4: mapper4_init(&agnes->mapper.m4, agnes); return true;
        default: return false;
    }
}

uint8_t mapper_read(agnes_t *agnes, uint16_t addr) {
    switch (agnes->gamepack.mapper) {
        case 0: return mapper0_read(&agnes->mapper.m0, addr);
        case 1: return mapper1_read(&agnes->mapper.m1, addr);
        case 2: return mapper2_read(&agnes->mapper.m2, addr);
        case 4: return mapper4_read(&agnes->mapper.m4, addr);
        default: return 0;
    }
}

void mapper_write(agnes_t *agnes, uint16_t addr, uint8_t val) {
    switch (agnes->gamepack.mapper) {
        case 0: mapper0_write(&agnes->mapper.m0, addr, val); break;
        case 1: mapper1_write(&agnes->mapper.m1, addr, val); break;
        case 2: mapper2_write(&agnes->mapper.m2, addr, val); break;
        case 4: mapper4_write(&agnes->mapper.m4, addr, val); break;
    }
}

void mapper_pa12_rising_edge(agnes_t *agnes) {
    switch (agnes->gamepack.mapper) {
        case 4: mapper4_pa12_rising_edge(&agnes->mapper.m4); break;
    }
}
//FILE_END
//FILE_START:mapper0.c

void mapper0_init(mapper0_t *mapper, agnes_t *agnes) {
    mapper->agnes = agnes;

    mapper->prg_bank_offsets[0] = 0;
    mapper->prg_bank_offsets[1] = agnes->gamepack.prg_rom_banks_count > 1 ? (16 * 1024) : 0;
    mapper->use_chr_ram = agnes->gamepack.chr_rom_banks_count == 0;
}

uint8_t mapper0_read(mapper0_t *mapper, uint16_t addr) {
    uint8_t res = 0;
    if (addr < 0x2000) {
        if (mapper->use_chr_ram) {
            res = mapper->chr_ram[addr];
        } else {
            res = mapper->agnes->gamepack.data[mapper->agnes->gamepack.chr_rom_offset + addr];
        }
    } else if (addr >= 0x8000) {
        int bank = addr >> 14 & 0x1;
        unsigned bank_offset = mapper->prg_bank_offsets[bank];
        unsigned addr_offset = addr & 0x3fff;
        unsigned offset = mapper->agnes->gamepack.prg_rom_offset + bank_offset + addr_offset;
        res = mapper->agnes->gamepack.data[offset];
    }
    return res;
}

void mapper0_write(mapper0_t *mapper, uint16_t addr, uint8_t val) {
    if (mapper->use_chr_ram && addr < 0x2000) {
        mapper->chr_ram[addr] = val;
    }
}
//FILE_END
//FILE_START:mapper1.c

static void mapper1_write_control(mapper1_t *mapper, uint8_t val);
static void mapper1_set_offsets(mapper1_t *mapper);

void mapper1_init(mapper1_t *mapper, agnes_t *agnes) {
    mapper->agnes = agnes;

    mapper->shift = 0;
    mapper->shift_count = 0;
    mapper->control = 0;
    mapper->prg_mode = 3;
    mapper->chr_mode = 0;
    mapper->chr_banks[0] = 0;
    mapper->chr_banks[1] = 0;
    mapper->prg_bank = 0;
    mapper->use_chr_ram = agnes->gamepack.chr_rom_banks_count == 0;

    mapper1_set_offsets(mapper);
}

uint8_t mapper1_read(mapper1_t *mapper, uint16_t addr) {

    uint8_t res = 0;
    if (addr < 0x2000) {
        if (mapper->use_chr_ram) {
            res = mapper->chr_ram[addr];
        } else {
            unsigned bank = (addr >> 12) & 0x1;
            unsigned bank_offset = mapper->chr_bank_offsets[bank];
            unsigned addr_offset = addr & 0xfff;
            unsigned offset = mapper->agnes->gamepack.chr_rom_offset + bank_offset + addr_offset;
            res = mapper->agnes->gamepack.data[offset];
        }
    } else if (addr >= 0x6000 && addr < 0x8000) {
        res = mapper->prg_ram[addr - 0x6000];
    } else if (addr >= 0x8000) {
        int bank = (addr >> 14) & 0x1;
        unsigned bank_offset = mapper->prg_bank_offsets[bank];
        unsigned addr_offset = addr & 0x3fff;
        unsigned offset = mapper->agnes->gamepack.prg_rom_offset + bank_offset + addr_offset;
        res = mapper->agnes->gamepack.data[offset];
    }
    return res;
}

void mapper1_write(mapper1_t *mapper, uint16_t addr, uint8_t val) {

    if (addr < 0x2000) {
        if (mapper->use_chr_ram) {
            mapper->chr_ram[addr] = val;
        }
    } else if (addr >= 0x6000 && addr < 0x8000) {
        mapper->prg_ram[addr - 0x6000] = val;
    } else if (addr >= 0x8000) {
        if (AGNES_GET_BIT(val, 7)) {
            mapper->shift = 0;
            mapper->shift_count = 0;
            mapper1_write_control(mapper,  mapper->control | 0x0c);
            mapper1_set_offsets(mapper);
        } else {
            mapper->shift >>= 1;
            mapper->shift = mapper->shift | ((val & 0x1) << 4);
            mapper->shift_count++;
            if (mapper->shift_count == 5) {
                uint8_t shift_val = mapper->shift & 0x1f;
                mapper->shift = 0;
                mapper->shift_count = 0;
                uint8_t reg = (addr >> 13) & 0x3; // bits 13 and 14 select register
                switch (reg) {
                    case 0: mapper1_write_control(mapper, shift_val); break;
                    case 1: mapper->chr_banks[0] = shift_val; break;
                    case 2: mapper->chr_banks[1] = shift_val; break;
                    case 3: mapper->prg_bank = shift_val & 0xf; break;
                }
                mapper1_set_offsets(mapper);
            }
        }
    }
}

static void mapper1_write_control(mapper1_t *mapper, uint8_t val) {
    mapper->control = val;
    switch (val & 0x3) {
        case 0: mapper->agnes->mirroring_mode = MIRRORING_MODE_SINGLE_LOWER; break;
        case 1: mapper->agnes->mirroring_mode = MIRRORING_MODE_SINGLE_UPPER; break;
        case 2: mapper->agnes->mirroring_mode = MIRRORING_MODE_VERTICAL; break;
        case 3: mapper->agnes->mirroring_mode = MIRRORING_MODE_HORIZONTAL; break;
    }
    mapper->prg_mode = (val >> 2) & 0x3;
    mapper->chr_mode = (val >> 4) & 0x1;
}

static void mapper1_set_offsets(mapper1_t *mapper) {
    switch (mapper->chr_mode) {
        case 0: {
            mapper->chr_bank_offsets[0] = (mapper->chr_banks[0] & 0xfe) * (8 * 1024);
            mapper->chr_bank_offsets[1] = (mapper->chr_banks[0] & 0xfe) * (8 * 1024) + (4 * 1024);
            break;
        }
        case 1: {
            mapper->chr_bank_offsets[0] = mapper->chr_banks[0] * (4 * 1024);
            mapper->chr_bank_offsets[1] = mapper->chr_banks[1] * (4 * 1024);
            break;
        }
    }

    switch (mapper->prg_mode) {
        case 0: case 1: {
            mapper->prg_bank_offsets[0] = (mapper->prg_bank & 0xe) * (32 * 1024);
            mapper->prg_bank_offsets[1] = (mapper->prg_bank & 0xe) * (32 * 1024) + (16 * 1024);
            break;
        }
        case 2: {
            mapper->prg_bank_offsets[0] = 0;
            mapper->prg_bank_offsets[1] = mapper->prg_bank * (16 * 1024);
            break;
        }
        case 3: {
            mapper->prg_bank_offsets[0] = mapper->prg_bank * (16 * 1024);
            mapper->prg_bank_offsets[1] = (mapper->agnes->gamepack.prg_rom_banks_count - 1) * (16 * 1024);
            break;
        }
    }
}
//FILE_END
//FILE_START:mapper2.c

void mapper2_init(mapper2_t *mapper, agnes_t *agnes) {
    mapper->agnes = agnes;
    mapper->prg_bank_offsets[0] = 0;
    mapper->prg_bank_offsets[1] = (agnes->gamepack.prg_rom_banks_count - 1) * (16 * 1024);
}

uint8_t mapper2_read(mapper2_t *mapper, uint16_t addr) {
    uint8_t res = 0;
    if (addr < 0x2000) {
        res = mapper->chr_ram[addr];
    } else if (addr >= 0x8000) {
        int bank = (addr >> 14) & 0x1;
        unsigned bank_offset = mapper->prg_bank_offsets[bank];
        unsigned addr_offset = addr & 0x3fff;
        unsigned offset = mapper->agnes->gamepack.prg_rom_offset + bank_offset + addr_offset;
        res = mapper->agnes->gamepack.data[offset];
    }
    return res;
}

void mapper2_write(mapper2_t *mapper, uint16_t addr, uint8_t val) {
    if (addr < 0x2000) {
        mapper->chr_ram[addr] = val;
    } else if (addr >= 0x8000) {
        int bank = val % (mapper->agnes->gamepack.prg_rom_banks_count);
        mapper->prg_bank_offsets[0] = bank * (16 * 1024);
    }
}
//FILE_END
//FILE_START:mapper4.c

static void mapper4_write_register(mapper4_t *mapper, uint16_t addr, uint8_t val);
static void mapper4_set_offsets(mapper4_t *mapper);

void mapper4_init(mapper4_t *mapper, agnes_t *agnes) {
    mapper->agnes = agnes;

    mapper->prg_mode = 0;
    mapper->chr_mode = 0;
    mapper->irq_enabled = false;
    mapper->reg_ix = 0;

    mapper->regs[0] = 0;
    mapper->regs[1] = 2;
    mapper->regs[2] = 4;
    mapper->regs[3] = 5;
    mapper->regs[4] = 6;
    mapper->regs[5] = 7;
    mapper->regs[6] = 0;
    mapper->regs[7] = 1;

    mapper->counter = 0;
    mapper->counter_reload = 0;
    mapper->use_chr_ram = agnes->gamepack.chr_rom_banks_count == 0;

    mapper4_set_offsets(mapper);
}

void mapper4_pa12_rising_edge(mapper4_t *mapper) {
    if (mapper->counter == 0) {
        mapper->counter = mapper->counter_reload;
    } else {
        mapper->counter--;
        if (mapper->counter == 0 && mapper->irq_enabled) {
            cpu_trigger_irq(&mapper->agnes->cpu);
        }
    }
}

uint8_t mapper4_read(mapper4_t *mapper, uint16_t addr) {
    uint8_t res = 0;
    if (addr < 0x2000) {
        int bank = (addr >> 10) & 0x7;
        unsigned bank_offset = mapper->chr_bank_offsets[bank];
        unsigned addr_offset = addr & 0x3ff;
        unsigned offset = bank_offset + addr_offset;
        if (mapper->use_chr_ram) {
            offset = offset & ((8 * 1024) - 1);
            res = mapper->chr_ram[offset];
        } else {
            unsigned chr_rom_size = (mapper->agnes->gamepack.chr_rom_banks_count * 8 * 1024);
            offset = offset % chr_rom_size;
            res = mapper->agnes->gamepack.data[mapper->agnes->gamepack.chr_rom_offset + offset];
        }
    } else if (addr >= 0x6000 && addr < 0x8000) {
        return mapper->prg_ram[addr - 0x6000];
    } else if (addr >= 0x8000) {
        int bank = (addr >> 13) & 0x3;
        unsigned bank_offset = mapper->prg_bank_offsets[bank];
        unsigned addr_offset = addr & 0x1fff;
        unsigned offset = mapper->agnes->gamepack.prg_rom_offset + bank_offset + addr_offset;
        res = mapper->agnes->gamepack.data[offset];
    }
    return res;
}

void mapper4_write(mapper4_t *mapper, uint16_t addr, uint8_t val) {
    if (addr < 0x2000 && mapper->use_chr_ram) {
        int bank = (addr >> 10) & 0x7;
        unsigned bank_offset = mapper->chr_bank_offsets[bank];
        unsigned addr_offset = addr & 0x3ff;
        unsigned full_offset = (bank_offset + addr_offset) & ((8 * 1024) - 1);
        mapper->chr_ram[full_offset] = val;
    } else if (addr >= 0x6000 && addr < 0x8000) {
         mapper->prg_ram[addr - 0x6000] = val;
    } else if (addr >= 0x8000) {
        mapper4_write_register(mapper, addr, val);
    }
}

static void mapper4_write_register(mapper4_t *mapper, uint16_t addr, uint8_t val) {
    bool addr_odd = addr & 0x1;
    bool addr_even = !addr_odd;
    if (addr <= 0x9ffe && addr_even) { // Bank select ($8000-$9FFE, even)
        mapper->reg_ix = val & 0x7;
        mapper->prg_mode = (val >> 6) & 0x1;
        mapper->chr_mode = (val >> 7) & 0x1;
        mapper4_set_offsets(mapper);
    } else if (addr <= 0x9fff && addr_odd) { // Bank data ($8001-$9FFF, odd)
        mapper->regs[mapper->reg_ix] = val;
        mapper4_set_offsets(mapper);
    } else if (addr <= 0xbffe && addr_even) { // Mirroring ($A000-$BFFE, even)
        if (mapper->agnes->mirroring_mode != MIRRORING_MODE_FOUR_SCREEN) {
            mapper->agnes->mirroring_mode = (val & 0x1) ? MIRRORING_MODE_HORIZONTAL : MIRRORING_MODE_VERTICAL;
        }
    } else if (addr <= 0xbfff && addr_odd) { // PRG RAM protect ($A001-$BFFF, odd)
        // probably not required (according to https://wiki.nesdev.com/w/index.php/MMC3)
    } else if (addr <= 0xdffe && addr_even) { // IRQ latch ($C000-$DFFE, even)
        mapper->counter_reload = val;
    } else if (addr <= 0xdfff && addr_odd) { // IRQ reload ($C001-$DFFF, odd)
        mapper->counter = 0;
    } else if (addr <= 0xfffe && addr_even) { // IRQ disable ($E000-$FFFE, even)
        mapper->irq_enabled = false;
    } else if (addr <= 0xffff && addr_odd) { // IRQ enable ($E001-$FFFF, odd)
        mapper->irq_enabled = true;
    }
}

static void mapper4_set_offsets(mapper4_t *mapper) {
    switch (mapper->chr_mode) {
        case 0: { // R0_1, R0_2, R1_1, R1_2, R2, R3, R4, R5
            mapper->chr_bank_offsets[0] = (mapper->regs[0] & 0xfe) * 1024;
            mapper->chr_bank_offsets[1] = (mapper->regs[0] & 0xfe) * 1024 + 1024;
            mapper->chr_bank_offsets[2] = (mapper->regs[1] & 0xfe) * 1024;
            mapper->chr_bank_offsets[3] = (mapper->regs[1] & 0xfe) * 1024 + 1024;
            mapper->chr_bank_offsets[4] = mapper->regs[2] * 1024;
            mapper->chr_bank_offsets[5] = mapper->regs[3] * 1024;
            mapper->chr_bank_offsets[6] = mapper->regs[4] * 1024;
            mapper->chr_bank_offsets[7] = mapper->regs[5] * 1024;
            break;
        }
        case 1: { // R2, R3, R4, R5, R0_1, R0_2, R1_1, R1_2
            mapper->chr_bank_offsets[0] = mapper->regs[2] * 1024;
            mapper->chr_bank_offsets[1] = mapper->regs[3] * 1024;
            mapper->chr_bank_offsets[2] = mapper->regs[4] * 1024;
            mapper->chr_bank_offsets[3] = mapper->regs[5] * 1024;
            mapper->chr_bank_offsets[4] = (mapper->regs[0] & 0xfe) * 1024;
            mapper->chr_bank_offsets[5] = (mapper->regs[0] & 0xfe) * 1024 + 1024;
            mapper->chr_bank_offsets[6] = (mapper->regs[1] & 0xfe) * 1024;
            mapper->chr_bank_offsets[7] = (mapper->regs[1] & 0xfe) * 1024 + 1024;
            break;
        }
    }

    switch (mapper->prg_mode) {
        case 0: { // R6, R7, -2, -1
            mapper->prg_bank_offsets[0] = mapper->regs[6] * (8 * 1024);
            mapper->prg_bank_offsets[1] = mapper->regs[7] * (8 * 1024);
            mapper->prg_bank_offsets[2] = (mapper->agnes->gamepack.prg_rom_banks_count - 1) * (16 * 1024);
            mapper->prg_bank_offsets[3] = (mapper->agnes->gamepack.prg_rom_banks_count - 1) * (16 * 1024) + (8 * 1024);
            break;
        }
        case 1: { // -2, R7, R6, -1
            mapper->prg_bank_offsets[0] = (mapper->agnes->gamepack.prg_rom_banks_count - 1) * (16 * 1024);
            mapper->prg_bank_offsets[1] = mapper->regs[7] * (8 * 1024);
            mapper->prg_bank_offsets[2] = mapper->regs[6] * (8 * 1024);
            mapper->prg_bank_offsets[3] = (mapper->agnes->gamepack.prg_rom_banks_count - 1) * (16 * 1024) + (8 * 1024);
            break;
        }
    }
}
#include <emscripten.h>

// 1. DECLARE THE PALETTE FIRST (Fixes the undeclared identifier error)
static const uint32_t REAL_NES_PALETTE[64] = {
    0xFF7C7C7C, 0xFFFC0000, 0xFFBC0000, 0xFFBC2844, 0xFF840084, 0xFF940020, 0xFF080094, 0xFF00108C,
    0xFF002074, 0xFF000030, 0xFF007000, 0xFF003800, 0xFF004000, 0xFF000000, 0xFF000000, 0xFF000000,
    0xFFBCBCBC, 0xFFECEC00, 0xFFF87824, 0xFFFC5454, 0xFFFC40B4, 0xFFD800B4, 0xFF0020F8, 0xFF0050D8,
    0xFF0078A8, 0xFF005800, 0xFF00A800, 0xFF008800, 0xFF000000, 0xFF000000, 0xFF000000, 0xFF000000,
    0xFFF8F8F8, 0xFFFCFC3C, 0xFFFCBC5C, 0xFFFCA0B4, 0xFFFC80E4, 0xFFEC60FC, 0xFF3088FC, 0xFF40A0FC,
    0xFF5CD8FC, 0xFF00D840, 0xFF58F858, 0xFF78F878, 0xFF00FCFC, 0xFFD8F8F8, 0xFF000000, 0xFF000000,
    0xFFFFFFFF, 0xFFFCFCE4, 0xFFFCE4A0, 0xFFFCD8B4, 0xFFFCC0F4, 0xFFFCC0FC, 0xFFA4E0FC, 0xFFA8E8FC,
    0xFFBCF0FC, 0xFFB8F8B8, 0xFFD8F8D8, 0xFFB8F8D8, 0xFF00FFFF, 0xFFF8FCFC, 0xFF000000, 0xFF000000
};

// Extern reference to agnes's internal palette mirror map array
extern unsigned g_palette_addr_map[32];

// Global pointer to hold our active emulator instance
static agnes_t* g_agnes = NULL;

// Dedicated 32-bit color buffer for our HTML5 Canvas (256 * 240 pixels)
static uint32_t g_wasm_framebuffer[256 * 240];

EMSCRIPTEN_KEEPALIVE
void run_frame(void) {
    if (g_agnes == NULL) return;
    agnes_next_frame(g_agnes);
}

EMSCRIPTEN_KEEPALIVE
int init_emulator(uint8_t* rom_data, size_t rom_size, int sample_rate) {
    if (g_agnes != NULL) {
        // Kill the existing browser animation loop hook
        emscripten_cancel_main_loop();
        if (g_agnes->cdl_buffer != NULL) free(g_agnes->cdl_buffer);
        agnes_destroy(g_agnes);
    }

    g_agnes = agnes_make();
    if (g_agnes == NULL) return 0;

    bool success = agnes_load_ines_data(g_agnes, (void*)rom_data, rom_size);
    if (!success) {
        agnes_destroy(g_agnes);
        g_agnes = NULL;
        return 0;
    }

    emscripten_set_main_loop(run_frame, 0, 0);

    return 1;
}

EMSCRIPTEN_KEEPALIVE
uint8_t* get_active_cdl_ptr(void) {
    if (g_agnes == NULL) return NULL;
    return g_agnes->cdl_buffer;
}

EMSCRIPTEN_KEEPALIVE
void pause_emulator(void) {
    emscripten_cancel_main_loop();
}

EMSCRIPTEN_KEEPALIVE
void resume_emulator(void) {
    emscripten_cancel_main_loop();
    emscripten_set_main_loop(run_frame, 0, 0);
}

/**
 * Resets the NES console state (Warm Reset).
 * Clears volatile registers and cycles while completely preserving
 * battery-backed PRG-RAM (SRAM) save data slots (e.g., Zelda save states).
 */
EMSCRIPTEN_KEEPALIVE
void reset_emulator() {

    // 1. Temporary buffer to hold battery-backed PRG-RAM (SRAM)
    uint8_t saved_prg_ram[8 * 1024];
    bool has_save_data = false;

    // Check if the current mapper handles save RAM data
    // Zelda uses Mapper 1 (MMC1), but Mapper 4 (MMC3) also utilizes battery RAM
    if (g_agnes->gamepack.mapper == 1) {
        memcpy(saved_prg_ram, g_agnes->mapper.m1.prg_ram, sizeof(g_agnes->mapper.m1.prg_ram));
        has_save_data = true;
    } else if (g_agnes->gamepack.mapper == 4) {
        memcpy(saved_prg_ram, g_agnes->mapper.m4.prg_ram, sizeof(g_agnes->mapper.m4.prg_ram));
        has_save_data = true;
    }

    // 2. Reset the system components to boot/reset defaults

    // Re-initialize the mapper to force fixed bank offsets to point to the reset vectors
    mapper_init(g_agnes);

    // cpu_init automatically wipes cpu registers, resets SP to 0xFD, and invokes apu_init()
    cpu_init(&g_agnes->cpu, g_agnes);

    // ppu_init clears background configuration flags and status registers
    ppu_init(&g_agnes->ppu, g_agnes);

    // Reset standard input latches
    g_agnes->controllers_latch = false;
    memset(g_agnes->controllers, 0, sizeof(g_agnes->controllers));

    // Note: Real NES hardware leaves internal console work RAM (agnes->ram)
    // mostly intact during a warm reset. If your emulator needs a hard factory
    // reset instead, uncomment the next line:
    // memset(agnes->ram, 0xff, sizeof(agnes->ram));

    // 3. Restore the cached save game slots back to the mapper space
    if (has_save_data) {
        if (g_agnes->gamepack.mapper == 1) {
            memcpy(g_agnes->mapper.m1.prg_ram, saved_prg_ram, sizeof(g_agnes->mapper.m1.prg_ram));
        } else if (g_agnes->gamepack.mapper == 4) {
            memcpy(g_agnes->mapper.m4.prg_ram, saved_prg_ram, sizeof(g_agnes->mapper.m4.prg_ram));
        }
    }
}

EMSCRIPTEN_KEEPALIVE
int get_active_cdl_size(void) {
    if (g_agnes == NULL) return 0;
    return g_agnes->cdl_size;
}

// Standardized screen buffer (RGBA). Same data as legacy get_active_framebuffer_ptr.
EMSCRIPTEN_KEEPALIVE
const uint32_t* get_screen_buffer_ptr(void) {
    if (g_agnes == NULL) return NULL;

    for (int y = 0; y < 240; y++) {
        for (int x = 0; x < 256; x++) {
            // Use agnes's native, optimized master color interpreter
            agnes_color_t c = agnes_get_screen_pixel(g_agnes, x, y);

            // Map the coordinates to a sequential 1D index
            int index = (y * 256) + x;

            // Assemble the clean 32-bit pixel exactly as HTML5 canvas expect it: ABGR/RGBA
            // Red goes to lowest byte, Green to second, Blue to third, Alpha to highest.
            g_wasm_framebuffer[index] = ((uint32_t)c.a << 24) |
                                        ((uint32_t)c.b << 16) |
                                        ((uint32_t)c.g << 8)  |
                                        ((uint32_t)c.r);
        }
    }

    return g_wasm_framebuffer;
}

/* Legacy alias — same implementation as get_screen_buffer_ptr. */
EMSCRIPTEN_KEEPALIVE
const uint32_t* get_active_framebuffer_ptr(void) {
    return get_screen_buffer_ptr();
}

EMSCRIPTEN_KEEPALIVE
int get_screen_width(void) {
    return 256;
}

EMSCRIPTEN_KEEPALIVE
int get_screen_height(void) {
    return 240;
}

EMSCRIPTEN_KEEPALIVE
const uint8_t* get_active_ppu_palette_ptr(void) {
    if (g_agnes == NULL) return NULL;

    // Returns a pointer directly to the 32 bytes of palette memory currently used by the PPU
    return g_agnes->ppu.palette;
}

/* Standardized palette name (matches MD/SNES). */
EMSCRIPTEN_KEEPALIVE
const uint8_t* get_active_palette_ptr(void) {
    return get_active_ppu_palette_ptr();
}

EMSCRIPTEN_KEEPALIVE
void set_controller_state(int controller_index, uint32_t button_mask, int is_pressed) {
    if (g_agnes == NULL || controller_index < 0 || controller_index > 1) return;

    if (is_pressed) {
        // Set the button bit to 1 (Pressed)
        g_agnes->controllers[controller_index].state |= button_mask;
    } else {
        // Clear the button bit to 0 (Released)
        g_agnes->controllers[controller_index].state &= ~button_mask;
    }
}

EMSCRIPTEN_KEEPALIVE
size_t get_save_state_size(void) {
    return sizeof(agnes_t);
}

EMSCRIPTEN_KEEPALIVE
void* get_emulator_instance_ptr(void) {
    return g_agnes;
}

EMSCRIPTEN_KEEPALIVE
unsigned char *save_state(void) {
    if (g_agnes == NULL) return NULL;

    // Using a static persistence buffer allows the WebAssembly/JS boundary
    // to read the memory instantly without dynamic malloc overhead or leaks.
    static agnes_state_t state;

    // Safely captures registers, RAM, and mapper parameters into the state struct
    agnes_dump_state(g_agnes, &state);

    return (unsigned char *)&state;
}

EMSCRIPTEN_KEEPALIVE
bool load_state(const unsigned char* data, unsigned int size) {
    if (g_agnes == NULL || data == NULL) return false;
    if (size < sizeof(agnes_state_t)) return false;

    // CRITICAL: Preserve custom allocated runtime resources (e.g. CDL data)
    // so they are not overwritten by stale or NULL pointers from the saved file.
    uint8_t *saved_cdl_buffer = g_agnes->cdl_buffer;
    int saved_cdl_size = g_agnes->cdl_size;

    // Restore volatile hardware components, VRAM, RAM, and internal bank matrices
    bool success = agnes_restore_state(g_agnes, (const agnes_state_t *)data);

    // Reattach the current session's runtime pointers back onto the global instance
    g_agnes->cdl_buffer = saved_cdl_buffer;
    g_agnes->cdl_size = saved_cdl_size;

    return success;
}

EMSCRIPTEN_KEEPALIVE
float* emu_get_audio_buffer(agnes_t *agnes) {
    return agnes->apu.audio_buffer;
}

EMSCRIPTEN_KEEPALIVE
int emu_get_audio_count(agnes_t *agnes) {
    return agnes->apu.buffer_index;
}

EMSCRIPTEN_KEEPALIVE
void emu_consume_audio(agnes_t *agnes, int count) {
    apu_t *apu = &agnes->apu;

    // Safety check: Don't consume more than we have, or negative amounts
    if (count <= 0 || count > apu->buffer_index) return;

    int leftovers = apu->buffer_index - count;

    // If there are leftover unread samples, slide them to the front of the buffer
    if (leftovers > 0) {
        memmove(apu->audio_buffer,
                &apu->audio_buffer[count],
                leftovers * sizeof(float));
    }

    // Update the index to point to the end of the leftovers
    apu->buffer_index = leftovers;
}

EMSCRIPTEN_KEEPALIVE
unsigned char *my_malloc(unsigned int length){
    return (unsigned char*)calloc(length, sizeof(unsigned char));
}

EMSCRIPTEN_KEEPALIVE
void my_free(unsigned char *ptr){
    free(ptr);
}

/*********************************** CHEATS ************************************/

void agnes_add_cheat(agnes_t *agnes, bool enable, uint16_t address, uint8_t value, bool has_compare, uint8_t compare) {
    if (agnes->num_cheats < AGNES_MAX_CHEATS) {
        agnes->cheats[agnes->num_cheats].enabled = enable;
        agnes->cheats[agnes->num_cheats].address = address;
        agnes->cheats[agnes->num_cheats].value = value;
        agnes->cheats[agnes->num_cheats].has_compare = has_compare;
        agnes->cheats[agnes->num_cheats].compare = compare;
        agnes->num_cheats++;
    }
}

void agnes_remove_cheat(agnes_t *agnes, int index) {
    if (index >= 0 && index < agnes->num_cheats) {
        for (int i = index; i < agnes->num_cheats - 1; i++) {
            agnes->cheats[i] = agnes->cheats[i + 1];
        }
        agnes->num_cheats--;
    }
}

void agnes_clear_cheats(agnes_t *agnes) {
    agnes->num_cheats = 0;
}

void agnes_enable_cheat(agnes_t *agnes, int index, bool enable) {
    if (index >= 0 && index < agnes->num_cheats) {
        agnes->cheats[index].enabled = enable;
    }
}

EMSCRIPTEN_KEEPALIVE
void add_cheat(int enable, uint32_t address, uint32_t value, int has_compare, uint32_t compare) {
    if (g_agnes) {
        agnes_add_cheat(g_agnes, enable, address, value, has_compare, compare);
    }
}

EMSCRIPTEN_KEEPALIVE
void remove_cheat(int index) {
    if (g_agnes) {
        agnes_remove_cheat(g_agnes, index);
    }
}

EMSCRIPTEN_KEEPALIVE
void clear_cheats(void) {
    if (g_agnes) {
        agnes_clear_cheats(g_agnes);
    }
}

EMSCRIPTEN_KEEPALIVE
void enable_cheat(int index, bool enable) {
    if (g_agnes) {
        agnes_enable_cheat(g_agnes, index, enable);
    }
}
//FILE_END
