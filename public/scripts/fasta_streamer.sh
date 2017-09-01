#!/bin/bash
awk -v readNum=$2 'BEGIN {n_seq=0;} /^>/ {if(n_seq%readNum==0){system("sleep 20");file=sprintf("myseq%d.fa",n_seq);} print >> file; n_seq++; next;} { print >> file; }' < $1
