/* Owned ALSA sequencer source for real device-adapter reviews. Never connects
 * to physical devices; consumers explicitly subscribe to this temporary port.
 * cc -O2 scripts/midi-review-fixture.c -lasound -o /tmp/manifold-midi-fixture
 * stdin: on/off/cc CHANNEL NOTE_OR_CC VALUE (zero-based MIDI channels). */
#include <alsa/asoundlib.h>
#include <stdio.h>
#include <string.h>
int main(int argc, char **argv) {
    snd_seq_t *seq;
    int error=snd_seq_open(&seq,"default",SND_SEQ_OPEN_OUTPUT,0);
    if(error<0){fprintf(stderr,"%s\n",snd_strerror(error));return 1;}
    snd_seq_set_client_name(seq,"ManifoldReview MIDI fixture");
    int port=snd_seq_create_simple_port(seq,argc>1?argv[1]:"ManifoldReview notes",SND_SEQ_PORT_CAP_READ|SND_SEQ_PORT_CAP_SUBS_READ,SND_SEQ_PORT_TYPE_MIDI_GENERIC|SND_SEQ_PORT_TYPE_APPLICATION);
    if(port<0){snd_seq_close(seq);return 2;}
    printf("{\"client\":%d,\"port\":%d}\n",snd_seq_client_id(seq),port);fflush(stdout);
    char line[256],kind[32];int channel,a,b;
    while(fgets(line,sizeof(line),stdin)) {
        if(sscanf(line,"%31s %d %d %d",kind,&channel,&a,&b)!=4)continue;
        if(channel<0||channel>15||a<0||a>127||b<0||b>127)continue;
        snd_seq_event_t event;snd_seq_ev_clear(&event);snd_seq_ev_set_source(&event,port);snd_seq_ev_set_subs(&event);snd_seq_ev_set_direct(&event);
        if(!strcmp(kind,"on"))snd_seq_ev_set_noteon(&event,channel,a,b);
        else if(!strcmp(kind,"off"))snd_seq_ev_set_noteoff(&event,channel,a,b);
        else if(!strcmp(kind,"cc"))snd_seq_ev_set_controller(&event,channel,a,b);
        else continue;
        error=snd_seq_event_output_direct(seq,&event);printf("{\"sent\":%s}\n",error>=0?"true":"false");fflush(stdout);
    }
    snd_seq_close(seq);return 0;
}
