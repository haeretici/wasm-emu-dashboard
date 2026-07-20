#ifndef _MY_FILE_STREAM_H_
#define _MY_FILE_STREAM_H_

#include <malloc.h>
#include <string.h>

#define RETRO_VFS_FILE_ACCESS_READ 1
#define RETRO_VFS_FILE_ACCESS_HINT_NONE 2

typedef struct{
    unsigned char *buffer;
    unsigned int size;
    unsigned int bufferSize;
    unsigned int curPos;
}RFILE;

RFILE *filestream_init_from_buffer(unsigned char *buffer, unsigned int bufferSize);
RFILE *filestream_open(const char *path, unsigned int flag, unsigned int flag2);
unsigned int filestream_read(RFILE *stream, void *data, unsigned int len);
int filestream_getc(RFILE *stream);
void filestream_close(RFILE *stream);

#endif//_MY_FILE_STREAM_H_