update() {
  pi=$(echo "scale=10; 4*a(1)" | bc -l)
  for i in `seq 3000`
    do
    angle=$( echo "($i*$pi) / 50.0" | bc -l )
    one=$( echo "s($angle)" | bc -l )
    two=$( echo "c($angle)" | bc -l )
    echo "$one, $two"
    echo "$one, $two" >> update.csv
    sleep 0.01
  done
  update
}

count=1
while [ $count -lt 100 ]
do
  update
done
