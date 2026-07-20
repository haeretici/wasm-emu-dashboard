/************************************ APU ************************************/

const uint8_t DUTY_TABLE[4][8] = {
    {0, 1, 0, 0, 0, 0, 0, 0}, // 12.5%
    {0, 1, 1, 0, 0, 0, 0, 0}, // 25%
    {0, 1, 1, 1, 1, 0, 0, 0}, // 50%
    {1, 0, 0, 1, 1, 1, 1, 1}  // 25% inverted
};

// Triangle 32-step waveform sequence
const uint8_t TRIANGLE_STEPS[32] = {
    15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0,
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15
};

// NTSC Noise Period table
const uint16_t NOISE_PERIOD_TABLE[16] = {
    4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068
};

static const uint8_t NES_LENGTH_TABLE[32] = {
    10, 254, 20, 2, 40, 4, 80, 6, 160, 8, 60, 10, 14, 12, 26, 14,
    12, 16, 24, 18, 48, 20, 96, 22, 192, 24, 72, 26, 16, 28, 32, 30
};

void apu_envelope_tick(apu_t *apu) {
    // Pulse 1 Envelope
    if (apu->p1_env_start) {
        apu->p1_env_start = false;
        apu->p1_env_vol = 15;
        apu->p1_env_divider = apu->p1_ctrl & 0x0F;
    } else {
        if (apu->p1_env_divider > 0) {
            apu->p1_env_divider--;
        } else {
            apu->p1_env_divider = apu->p1_ctrl & 0x0F;
            if (apu->p1_env_vol > 0) {
                apu->p1_env_vol--;
            } else if (apu->p1_ctrl & 0x20) { // Loop flag
                apu->p1_env_vol = 15;
            }
        }
    }

    // Pulse 2 Envelope
    if (apu->p2_env_start) {
        apu->p2_env_start = false;
        apu->p2_env_vol = 15;
        apu->p2_env_divider = apu->p2_ctrl & 0x0F;
    } else {
        if (apu->p2_env_divider > 0) {
            apu->p2_env_divider--;
        } else {
            apu->p2_env_divider = apu->p2_ctrl & 0x0F;
            if (apu->p2_env_vol > 0) {
                apu->p2_env_vol--;
            } else if (apu->p2_ctrl & 0x20) { // Loop flag
                apu->p2_env_vol = 15;
            }
        }
    }
    
    // Noise Envelope
    if (apu->noise_env_start) {
        apu->noise_env_start = false;
        apu->noise_env_vol = 15;
        apu->noise_env_divider = apu->noise_ctrl & 0x0F;
    } else {
        if (apu->noise_env_divider > 0) {
            apu->noise_env_divider--;
        } else {
            apu->noise_env_divider = apu->noise_ctrl & 0x0F;
            if (apu->noise_env_vol > 0) {
                apu->noise_env_vol--;
            } else if (apu->noise_ctrl & 0x20) { // Loop flag
                apu->noise_env_vol = 15;
            }
        }
    }
    
    // --- Triangle Linear Counter ---
    if (apu->tri_reload_flag) {
        apu->tri_linear_counter = apu->tri_linear & 0x7F;
    } else if (apu->tri_linear_counter > 0) {
        apu->tri_linear_counter--;
    }
    
    // If the control flag (bit 7) is clear, clear the reload flag
    if (!(apu->tri_linear & 0x80)) {
        apu->tri_reload_flag = false;
    }
}

void apu_tick(agnes_t *agnes) {
    apu_t *apu = &agnes->apu;

    apu->apu_alternate_cycle = !apu->apu_alternate_cycle;

    if (apu->apu_alternate_cycle) {
        if (apu->p1_timer_current > 0) {
            apu->p1_timer_current--;
        } else {
            apu->p1_timer_current = apu->p1_timer;
            apu->p1_duty_pos = (apu->p1_duty_pos + 1) & 7;
        }

        if (apu->p2_timer_current > 0) {
            apu->p2_timer_current--;
        } else {
            apu->p2_timer_current = apu->p2_timer;
            apu->p2_duty_pos = (apu->p2_duty_pos + 1) & 7;
        }
    }

    // --- NEW: CLOCK THE LENGTH COUNTERS (~60Hz frame sync) ---
    // Length counters tick twice per APU frame sequence: 1789773 Hz / 120 Hz ≈ 14915 cycles
    static int frame_counter_divider = 0;
    frame_counter_divider++;
    if (frame_counter_divider >= 14915) {
        frame_counter_divider = 0;

        // Pulse 1 length counter decrement (if loop/halt flag bit 5 is not set)
        bool p1_halt = (apu->p1_ctrl & 0x20) != 0;
        if (apu->p1_length_counter > 0 && !p1_halt) {
            apu->p1_length_counter--;
        }

        // Pulse 2 length counter decrement
        bool p2_halt = (apu->p2_ctrl & 0x20) != 0;
        if (apu->p2_length_counter > 0 && !p2_halt) {
            apu->p2_length_counter--;
        }
        // --- PULSE 1 SWEEP ---
        bool p1_sweep_enabled = apu->p1_sweep & 0x80;
        uint8_t p1_sweep_shift = apu->p1_sweep & 0x07;

        if (p1_sweep_enabled && p1_sweep_shift > 0) {
            if (apu->p1_sweep_divider == 0) {
                // Reload the divider
                apu->p1_sweep_divider = (apu->p1_sweep >> 4) & 0x07;

                // Calculate the pitch shift amount
                int change = apu->p1_timer >> p1_sweep_shift;
                if (apu->p1_sweep & 0x08) { // Negate flag (pitch goes up)
                    apu->p1_timer -= change;
                    apu->p1_timer--; // Hardware quirk: Pulse 1 negate subtracts an extra 1
                } else { // Pitch goes down
                    apu->p1_timer += change;
                }
            } else {
                apu->p1_sweep_divider--;
            }
        }
        // APU Hardware rule: Mute channel if timer is too low or exceeds 11 bits
        if (apu->p1_timer < 8 || apu->p1_timer > 0x7FF) {
            apu->p1_length_counter = 0;
        }

        // --- PULSE 2 SWEEP ---
        bool p2_sweep_enabled = apu->p2_sweep & 0x80;
        uint8_t p2_sweep_shift = apu->p2_sweep & 0x07;

        if (p2_sweep_enabled && p2_sweep_shift > 0) {
            if (apu->p2_sweep_divider == 0) {
                apu->p2_sweep_divider = (apu->p2_sweep >> 4) & 0x07;

                int change = apu->p2_timer >> p2_sweep_shift;
                if (apu->p2_sweep & 0x08) {
                    apu->p2_timer -= change;
                    // Note: Pulse 2 does NOT have the extra -1 quirk that Pulse 1 has!
                } else {
                    apu->p2_timer += change;
                }
            } else {
                apu->p2_sweep_divider--;
            }
        }
        if (apu->p2_timer < 8 || apu->p2_timer > 0x7FF) {
            apu->p2_length_counter = 0;
        }
    }

    // --- NEW: DMC SAMPLE FETCHING ---
    // A simple generic timer to prevent fetching all audio bytes in a single frame.
    // (A full emulator calculates this based on the rate index in apu->dmc_ctrl).
    static int dmc_fetch_timer = 0;

    if (apu->dmc_bytes_remaining > 0) {
        dmc_fetch_timer++;

        // Fetch a byte roughly every 100 APU ticks
        if (dmc_fetch_timer >= 100) {
            dmc_fetch_timer = 0;

            // 1. Tell the CPU that the APU is hijacking the bus for audio
            agnes->cpu.is_apu_fetching_audio = true;

            // 2. Fetch the byte. Because we set the flag above, your updated
            //    cpu_read8 will automatically log this byte as 0x04!
            uint8_t sample_byte = cpu_read8(&agnes->cpu, apu->dmc_current_address);

            // 3. Relinquish the bus
            agnes->cpu.is_apu_fetching_audio = false;

            // Advance DMC hardware pointers
            if (apu->dmc_current_address == 0xFFFF) {
                apu->dmc_current_address = 0x8000;
            } else {
                apu->dmc_current_address++;
            }

            apu->dmc_bytes_remaining--;

            // Note: If you want to actually play the audio, you would send 'sample_byte'
            // into a DMC shift register here to modify the output synthesis.
        }
    }

    // --- OUTPUT SYNTHESIS ---
    float p1_sample = 0.0f;
    uint8_t duty_type = (apu->p1_ctrl >> 6) & 3;
    uint8_t volume = apu->p1_ctrl & 0x0F;

    // FIX: Only output audio if the length counter is GREATER than 0!
    if (DUTY_TABLE[duty_type][apu->p1_duty_pos] && apu->p1_timer > 7 && apu->p1_length_counter > 0) {
        p1_sample = (float)volume / 15.0f;
    }

    float p2_sample = 0.0f;
    uint8_t p2_duty_type = (apu->p2_ctrl >> 6) & 3;
    uint8_t p2_volume = apu->p2_ctrl & 0x0F;

    if (DUTY_TABLE[p2_duty_type][apu->p2_duty_pos] && apu->p2_timer > 7 && apu->p2_length_counter > 0) {
        p2_sample = (float)p2_volume / 15.0f;
    }

    // --- SAMPLING STREAM INJECTION ---
    apu->cycle_accumulator += 1.0;

    if (apu->cycle_accumulator >= 40.58) {
        apu->cycle_accumulator -= 40.58;
        float mixed_sample = (p1_sample + p2_sample) * 0.3f;

        if (apu->buffer_index < OUT_BUFFER_SIZE) {
            apu->audio_buffer[apu->buffer_index++] = mixed_sample;
        }
    }
}

void apu_init(agnes_t *agnes) {
    apu_t *apu = &agnes->apu;

    // Explicitly zero out the entire structure to clear pointers, counters, and buffers
    memset(apu, 0, sizeof(apu_t));

    // Initialize specific defaults if your engine needs them
    apu->buffer_index = 0;
    apu->cycle_accumulator = 0.0;
    apu->frame_divider = 0;

    // The real NES boots with specific values in some registers,
    // but zeroing them out is perfectly safe for a starter audio engine.
}

void apu_write(agnes_t *agnes, uint16_t addr, uint8_t val) {
    apu_t *apu = &agnes->apu;

    switch (addr) {
        // --- PULSE 1 ---
        case 0x4000:
            apu->p1_ctrl = val;
            break;
        case 0x4001:
            apu->p1_sweep = val;
            // Note: Many engines flag a sweep update here to recalculate target frequencies
            apu->p1_sweep_divider = (val >> 4) & 0x07;
            break;
        case 0x4002:
            apu->p1_low = val;
            apu->p1_timer = (apu->p1_timer & 0x0700) | val;
            break;
        case 0x4003:
            apu->p1_high = val;
            apu->p1_timer = (apu->p1_timer & 0x00FF) | ((val & 0x07) << 8);
            apu->p1_duty_pos = 0; // Reset phase
            
            // CRITICAL: Only load length counter if channel is ENABLED in status!
            if (apu->status & 0x01) { 
                apu->p1_length_counter = NES_LENGTH_TABLE[val >> 3];
            }
            apu->p1_env_start = true; // Trigger envelope
            break;

        // --- PULSE 2 ---
        case 0x4004:
            apu->p2_ctrl = val;
            break;
        case 0x4005:
            apu->p2_sweep = val;
            apu->p2_sweep_divider = (val >> 4) & 0x07;
            break;
        case 0x4006:
            apu->p2_low = val;
            apu->p2_timer = (apu->p2_timer & 0x0700) | val;
            break;
        case 0x4007:
            apu->p2_high = val;
            apu->p2_timer = (apu->p2_timer & 0x00FF) | ((val & 0x07) << 8);
            apu->p2_duty_pos = 0; // Reset phase
            
            // CRITICAL: Only load length counter if channel is ENABLED in status!
            if (apu->status & 0x02) {
                apu->p2_length_counter = NES_LENGTH_TABLE[val >> 3];
            }
            apu->p2_env_start = true; // Trigger envelope
            break;

        // --- TRIANGLE ---
        case 0x4008:
            apu->tri_linear = val;
            break;
        case 0x4009:
            // $4009 is unused on the standard NES APU, but caught for completeness.
            break;
        case 0x400A:
            apu->tri_low = val;
            apu->tri_timer = (apu->tri_timer & 0x0700) | val;
            break;
        case 0x400B:
            apu->tri_high = val;
            apu->tri_timer = (apu->tri_timer & 0x00FF) | ((val & 0x07) << 8);
            if (apu->status & 0x04) apu->tri_length_counter = NES_LENGTH_TABLE[val >> 3];
            apu->tri_reload_flag = true; // Critical for Triangle
            break;

        // --- NOISE ---
        case 0x400C:
            apu->noise_ctrl = val;
            break;
        case 0x400D:
            // $400D is unused
            break;
        case 0x400E:
            apu->noise_period = val;
            break;
        case 0x400F:
            apu->noise_length = val;
            if (apu->status & 0x08) apu->noise_length_counter = NES_LENGTH_TABLE[val >> 3];
            apu->noise_env_start = true; // Critical for Noise
            break;

        // --- DMC (Delta Modulation Channel) ---
        case 0x4010:
            apu->dmc_ctrl = val;
            break;
        case 0x4011:
            apu->dmc_value = val & 0x7F; // Directly sets the 7-bit DAC counter
            break;
        case 0x4012:
            apu->dmc_addr = val;
            break;
        case 0x4013:
            apu->dmc_length = val;
            break;

        // --- APU STATUS / CONTROL ---
        case 0x4015:
            apu->status = val;
            // Real NES behavior: Writing a 0 to bits 0-3 instantly silences channels
            // by clearing their internal length counters.
            if (!(val & 0x01)) {
                apu->p1_length_counter = 0;
            }
            if (!(val & 0x02)) {
                apu->p2_length_counter = 0;
            }
            if (!(val & 0x04)) {
                apu->tri_length_counter = 0;
            }
            if (!(val & 0x08)) {
                apu->noise_length_counter = 0;
            }
            // Bit 4 clears DMC interrupt flag
            // --- NEW: DMC Activation (Bit 4) ---
            if (val & 0x10) {
                // If activated and currently empty, restart the fetch sequence
                if (apu->dmc_bytes_remaining == 0) {
                    apu->dmc_current_address = 0xC000 + (apu->dmc_addr * 64);
                    apu->dmc_bytes_remaining = (apu->dmc_length * 16) + 1;
                }
            } else {
                // If deactivated, clear the remaining bytes to silence it
                apu->dmc_bytes_remaining = 0;
            }
            break;

        // --- APU FRAME COUNTER ---
        case 0x4017:
            apu->frame_counter = val;
            // Controls the 4-step or 5-step sequences ticking the envelopes/length counters.
            // If bit 7 is set, it immediately triggers an APU frame clock tick.
            break;

        default:
            // Do nothing for values out of range or handled by standard I/O (like Joypads at 0x4016)
            break;
    }
}

void apu_frame_sequencer_tick(agnes_t *agnes) {
    apu_t *apu = &agnes->apu;

    // --- Length Counters ---
    // Noise Length Counter
    bool noise_halt = (apu->noise_ctrl & 0x20) != 0;
    if (apu->noise_length_counter > 0 && !noise_halt) {
        apu->noise_length_counter--;
    }

    // Triangle Length Counter
    bool tri_halt = (apu->tri_linear & 0x80) != 0;
    if (apu->tri_length_counter > 0 && !tri_halt) {
        apu->tri_length_counter--;
    }

    // Pulse 1 Length Counter
    bool p1_halt = (apu->p1_ctrl & 0x20) != 0;
    if (apu->p1_length_counter > 0 && !p1_halt) {
        apu->p1_length_counter--;
    }

    // Pulse 2 Length Counter
    bool p2_halt = (apu->p2_ctrl & 0x20) != 0;
    if (apu->p2_length_counter > 0 && !p2_halt) {
        apu->p2_length_counter--;
    }

    // --- Pulse 1 Sweep ---
    bool p1_sweep_enabled = apu->p1_sweep & 0x80;
    uint8_t p1_shift = apu->p1_sweep & 0x07;
    if (p1_sweep_enabled && p1_shift > 0) {
        if (apu->p1_sweep_divider == 0) {
            apu->p1_sweep_divider = (apu->p1_sweep >> 4) & 0x07;
            int change = apu->p1_timer >> p1_shift;
            if (apu->p1_sweep & 0x08) {
                apu->p1_timer -= change;
                apu->p1_timer--;           // Pulse 1 extra -1 quirk
            } else {
                apu->p1_timer += change;
            }
        } else {
            apu->p1_sweep_divider--;
        }
    }

    // --- Pulse 2 Sweep ---
    bool p2_sweep_enabled = apu->p2_sweep & 0x80;
    uint8_t p2_shift = apu->p2_sweep & 0x07;
    if (p2_sweep_enabled && p2_shift > 0) {
        if (apu->p2_sweep_divider == 0) {
            apu->p2_sweep_divider = (apu->p2_sweep >> 4) & 0x07;
            int change = apu->p2_timer >> p2_shift;
            if (apu->p2_sweep & 0x08) {
                apu->p2_timer -= change;
            } else {
                apu->p2_timer += change;
            }
        } else {
            apu->p2_sweep_divider--;
        }
    }

}


bool is_p1_muted(apu_t *apu) {
    if (apu->p1_timer < 8) return true;
    
    // Mute if the SWEEP target pushes it out of bounds, 
    // even if the sweep isn't actively shifting yet!
    int change = apu->p1_timer >> (apu->p1_sweep & 0x07);
    int target = apu->p1_timer;
    if (apu->p1_sweep & 0x08) target -= change + 1; // Pulse 1 negate quirk
    else target += change;
    
    return (target > 0x7FF);
}

bool is_p2_muted(apu_t *apu) {
    if (apu->p2_timer < 8) return true;
    int change = apu->p2_timer >> (apu->p2_sweep & 0x07);
    int target = apu->p2_timer;
    if (apu->p2_sweep & 0x08) target -= change; // Pulse 2 has no quirk
    else target += change;
    
    return (target > 0x7FF);
}

void apu_generate_sample(agnes_t *agnes) {
    apu_t *apu = &agnes->apu;

    // --- PULSE 1 ---
    float p1_sample = 0.0f;
    uint8_t duty_type = (apu->p1_ctrl >> 6) & 3;
    
    // Determine volume: Is bit 4 (Constant Volume) set?
    uint8_t volume1 = (apu->p1_ctrl & 0x10) ? (apu->p1_ctrl & 0x0F) : apu->p1_env_vol;

    if (!is_p1_muted(apu) && 
        DUTY_TABLE[duty_type][apu->p1_duty_pos] && 
        apu->p1_length_counter > 0) {
        p1_sample = (float)volume1 / 15.0f;
    }

    // --- PULSE 2 ---
    float p2_sample = 0.0f;
    uint8_t p2_duty_type = (apu->p2_ctrl >> 6) & 3;
    
    // Determine volume: Is bit 4 (Constant Volume) set?
    uint8_t volume2 = (apu->p2_ctrl & 0x10) ? (apu->p2_ctrl & 0x0F) : apu->p2_env_vol;

    if (!is_p2_muted(apu) && 
        DUTY_TABLE[p2_duty_type][apu->p2_duty_pos] && 
        apu->p2_length_counter > 0) {
        p2_sample = (float)volume2 / 15.0f;
    }
    
    // --- TRIANGLE ---
    float tri_sample = 0.0f;
    if (apu->tri_length_counter > 0 && apu->tri_linear_counter > 0) {
        tri_sample = (float)TRIANGLE_STEPS[apu->tri_step] / 15.0f;
    }

    // --- NOISE ---
    float noise_sample = 0.0f;
    uint8_t noise_vol = (apu->noise_ctrl & 0x10) ? (apu->noise_ctrl & 0x0F) : apu->noise_env_vol;
    
    // Hardware Rule: If bit 0 of the LFSR is 1, the output is silenced.
    if (apu->noise_length_counter > 0 && !(apu->noise_shift_reg & 1)) {
        noise_sample = (float)noise_vol / 15.0f;
    }

    // --- MIXING ---
    // Instead of just multiplying Pulses by 0.3f, we mix all 4 channels.
    // A linear mix is fine for now, though a real NES uses a non-linear look-up table.
    float mixed_sample = (p1_sample * 0.25f) + 
                         (p2_sample * 0.25f) + 
                         (tri_sample * 0.25f) + 
                         (noise_sample * 0.20f);

    if (apu->buffer_index < OUT_BUFFER_SIZE) {
        apu->audio_buffer[apu->buffer_index++] = mixed_sample;
    }
}

void apu_run_for(agnes_t *agnes, int cycles) {
    apu_t *apu = &agnes->apu;

    for (int i = 0; i < cycles; ++i) {
        // --- TRIANGLE CLOCK (Ticks EVERY cycle) ---
        if (apu->tri_timer_current > 0) {
            apu->tri_timer_current--;
        } else {
            apu->tri_timer_current = apu->tri_timer;
            // Only advance the Triangle sequence if both length and linear counters are active
            if (apu->tri_length_counter > 0 && apu->tri_linear_counter > 0) {
                apu->tri_step = (apu->tri_step + 1) & 0x1F;
            }
        }
        
        apu->apu_alternate_cycle = !apu->apu_alternate_cycle;

        if (apu->apu_alternate_cycle) {
            // Pulse timers (tick at 2x rate)
            if (apu->p1_timer_current > 0) apu->p1_timer_current--;
            else {
                apu->p1_timer_current = apu->p1_timer;
                apu->p1_duty_pos = (apu->p1_duty_pos + 1) & 7;
            }

            if (apu->p2_timer_current > 0) apu->p2_timer_current--;
            else {
                apu->p2_timer_current = apu->p2_timer;
                apu->p2_duty_pos = (apu->p2_duty_pos + 1) & 7;
            }
            // --- NOISE CLOCK (LFSR) ---
            if (apu->noise_timer_current > 0) {
                apu->noise_timer_current--;
            } else {
                // Reload timer from the 4-bit period index
                apu->noise_timer_current = NOISE_PERIOD_TABLE[apu->noise_period & 0x0F];
                
                uint16_t shift = apu->noise_shift_reg;
                if (shift == 0) shift = 1; // Failsafe
                
                // Noise Mode 1 (Looping) uses bit 6, Mode 0 uses bit 1
                uint16_t bit_pos = (apu->noise_period & 0x80) ? 6 : 1;
                uint16_t feedback = (shift & 1) ^ ((shift >> bit_pos) & 1);
                
                apu->noise_shift_reg = (shift >> 1) | (feedback << 14);
            }
        }

        // Frame sequencer (~60Hz) - FIXED: Now tracking safely inside the instance state
        apu->frame_divider++;
        if (apu->frame_divider >= 7457) { // 1789773 Hz / 240 Hz ≈ 7457 cycles
            apu->frame_divider = 0;
            apu->frame_step++;

            // Envelopes tick EVERY step (~240Hz)
            apu_envelope_tick(apu);

            // Length counters and Sweeps tick on ALTERNATE steps (~120Hz)
            if (apu->frame_step % 2 == 0) {
                apu_frame_sequencer_tick(agnes);
            }
        }

        // Sample generation (~44.1kHz)
        apu->cycle_accumulator += 1.0;
        if (apu->cycle_accumulator >= 40.58) {
            apu->cycle_accumulator -= 40.58;
            apu_generate_sample(agnes);
        }
    }
}
