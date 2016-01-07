To test the online monitoring feature, 
* set appConfig.POLLING_INTERVAL=5000 (ms)
* run the app, open file `examples/tests/no_timestamp.csv`
* run this shell script: `for i in `seq 100`; do echo "$i, $(($i+10))"; echo "$i, $(($i+10))">>no_timestamp.csv; sleep 2; done`
