for i in `seq 10000`;
  do echo "$i, $(($i+10))";
  echo "$i, $(($i+10))" >> no_timestamp.csv;
  sleep 2;
done
