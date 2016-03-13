update() {
  for i in `seq 100`;
    do echo "$i, $(($i+10))";
    echo "$i, $(($i+10))" >> no_timestamp.csv;
    sleep 0.01;
  done
  update
}

update
