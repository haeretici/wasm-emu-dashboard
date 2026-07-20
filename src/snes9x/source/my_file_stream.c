#include "my_file_stream.h"

RFILE *filestream_init_from_buffer(unsigned char *buffer, unsigned int bufferSize){
    if(!buffer)return NULL;
    RFILE *dest = (RFILE*)calloc(1, sizeof(RFILE));
    if(!dest)return NULL;
    dest->buffer = (unsigned char*)calloc(bufferSize, sizeof(unsigned char));
    if(!dest->buffer){
        free(dest);
        return NULL;
    }
    memcpy(dest->buffer, buffer, bufferSize);
    dest->size = bufferSize;
    dest->bufferSize = bufferSize;
    return dest;
}

RFILE *filestream_open(const char *path, unsigned int flag, unsigned int flag2){
    //dummy func
    return NULL;
}

unsigned int filestream_read(RFILE *stream, void *data, unsigned int len){
    unsigned char *pData = (unsigned char*)data;
    if(stream->curPos + len <= stream->size){
        memcpy(pData, stream->buffer + stream->curPos, len);
        return len;
        stream->curPos += len;
    }else if(stream->curPos < stream->size){
        unsigned int readSize = stream->size - stream->curPos;
        memcpy(pData, stream->buffer + stream->curPos, readSize);
        return readSize;
        stream->curPos += readSize;
    }else{
        return 0;
    }
}

int filestream_getc(RFILE *stream){
    if(!stream || stream->curPos >= stream->size || !stream->buffer)return -1;
    int dest = stream->buffer[stream->curPos];
    stream->curPos++;
    return dest;
}

void filestream_close(RFILE *stream){
    if(stream){
        free(stream->buffer);
        free(stream);
    }
}