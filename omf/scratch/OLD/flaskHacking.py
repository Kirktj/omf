'''
Making flask do stuff.
'''

import multiprocessing, time
from flask import Flask, request, make_response

app = Flask(__name__)

crazyGlobalThing = {'pants':5}
from threading import Thread

print 'garbage!'

def testThing():
	print 'okeydoke'
	time.sleep(100)
	print 'FUCK'

print 'GlobalCheck:', globals()
print 'Test already up?', 'test' in globals()

time.sleep(2)

test = Thread(target=testThing)
test.start()

@app.route('/')
def root():
	print request.cookies.get('cook')
	return 'Pizza cake!'

@app.route('/putcookie')
def cookie():
	resp = make_response()
	resp.set_cookie('cook', 'chancellor')
	return resp

if __name__ == '__main__':
	app.run(debug=True)