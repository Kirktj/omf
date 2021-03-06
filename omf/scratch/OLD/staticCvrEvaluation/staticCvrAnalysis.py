''' Calculate CVR impacts using a targetted set of static loadflows. '''

import os, csv, math, re, sys
sys.path.append('../..')
sys.path.append('../../solvers/')
import feeder, milToGridlab, gridlabd
from pprint import pprint as pp
from copy import copy
from matplotlib import pyplot as plt

def _roundOne(x,direc):
	''' Round x in direc (up/down) to 1 sig fig. '''
	thou = 10.0**math.floor(math.log10(x))
	decForm = x/thou
	if direc=='up':
		return math.ceil(decForm)*thou
	elif direc=='down':
		return math.floor(decForm)*thou
	else:
		raise Exception


def runAnalysis(tree, monthData, rates):
	''' Run CVR analysis. '''

	# Graph the SCADA data.
	fig = plt.figure(figsize=(17,5))
	indices = [r['monthName'] for r in monthData]
	d1 = [r['histPeak']/(10**3) for r in monthData]
	d2 = [r['histAverage']/(10**3) for r in monthData]
	ticks = range(len(d1))
	plt.bar(ticks,d1,color='gray')
	plt.bar(ticks,d2,color='dimgray')
	plt.xticks([t+0.5 for t in ticks],indices)
	plt.ylabel('Mean and peak historical power consumptions (kW)')

	# Graph feeder.
	myGraph = feeder.treeToNxGraph(tree)
	feeder.latLonNxGraph(myGraph, neatoLayout=False)

	# Get the load levels we need to test.
	allLoadLevels = [x.get('histPeak',0) for x in monthData] + [y.get('histAverage',0) for y in monthData]
	maxLev = _roundOne(max(allLoadLevels),'up')
	minLev = _roundOne(min(allLoadLevels),'down')
	tenLoadLevels = range(int(minLev),int(maxLev),int((maxLev-minLev)/10))

	# Gather variables from the feeder.
	for key in tree.keys():
		# Set clock to single timestep.
		if tree[key].get('clock','') == 'clock':
			tree[key] = {"timezone":"PST+8PDT",
				"stoptime":"'2013-01-01 00:00:00'",
				"starttime":"'2013-01-01 00:00:00'",
				"clock":"clock"}
		# Save swing node index.
		if tree[key].get('bustype','').lower() == 'swing':
			swingIndex = key
			swingName = tree[key].get('name')
		# Remove all includes.
		if tree[key].get('omftype','') == '#include':
			del key

	# Find the substation regulator and config.
	for key in tree:
		if tree[key].get('object','') == 'regulator' and tree[key].get('from','') == swingName:
			regIndex = key
			regConfName = tree[key]['configuration']
	for key in tree:
		if tree[key].get('name','') == regConfName:
			regConfIndex = key

	# Set substation regulator to manual operation.
	baselineTap = 3 # GLOBAL VARIABLE FOR DEFAULT TAP POSITION
	tree[regConfIndex] = {
		'name':tree[regConfIndex]['name'],
		'object':'regulator_configuration',
		'connect_type':'1',
		'raise_taps':'10',
		'lower_taps':'10',
		'CT_phase':'ABC',
		'PT_phase':'ABC',
		'regulation':'0.10', #Yo, 0.10 means at tap_pos 10 we're 10% above 120V.
		'Control':'MANUAL',
		'control_level':'INDIVIDUAL',
		'Type':'A',
		'tap_pos_A':str(baselineTap),
		'tap_pos_B':str(baselineTap),
		'tap_pos_C':str(baselineTap) }

	# Attach recorders relevant to CVR.
	recorders = [
		{'object': 'collector',
		'file': 'ZlossesTransformer.csv',
		'group': 'class=transformer',
		'limit': '0',
		'property': 'sum(power_losses_A.real),sum(power_losses_A.imag),sum(power_losses_B.real),sum(power_losses_B.imag),sum(power_losses_C.real),sum(power_losses_C.imag)'},
		{'object': 'collector',
		'file': 'ZlossesUnderground.csv',
		'group': 'class=underground_line',
		'limit': '0',
		'property': 'sum(power_losses_A.real),sum(power_losses_A.imag),sum(power_losses_B.real),sum(power_losses_B.imag),sum(power_losses_C.real),sum(power_losses_C.imag)'},
		{'object': 'collector',
		'file': 'ZlossesOverhead.csv',
		'group': 'class=overhead_line',
		'limit': '0',
		'property': 'sum(power_losses_A.real),sum(power_losses_A.imag),sum(power_losses_B.real),sum(power_losses_B.imag),sum(power_losses_C.real),sum(power_losses_C.imag)'},
		{'object': 'recorder',
		'file': 'Zregulator.csv',
		'limit': '0',
		'parent': tree[regIndex]['name'],
		'property': 'tap_A,tap_B,tap_C,power_in.real,power_in.imag'},
		{'object': 'collector',
		'file': 'ZvoltageJiggle.csv',
		'group': 'class=triplex_meter',
		'limit': '0',
		'property': 'min(voltage_12.mag),mean(voltage_12.mag),max(voltage_12.mag),std(voltage_12.mag)'},
		{'object': 'recorder',
		'file': 'ZsubstationTop.csv',
		'limit': '0',
		'parent': tree[swingIndex]['name'],
		'property': 'voltage_A,voltage_B,voltage_C'},
		{'object': 'recorder',
		'file': 'ZsubstationBottom.csv',
		'limit': '0',
		'parent': tree[regIndex]['to'],
		'property': 'voltage_A,voltage_B,voltage_C'} ]
	biggest = 1 + max([int(k) for k in tree.keys()])
	for index, rec in enumerate(recorders):
		tree[biggest + index] = rec

	# Change constant PF loads to ZIP loads. (See evernote for rationale about 50/50 power/impedance mix.)
	blankZipModel = {'object':'triplex_load',
		'name':'NAMEVARIABLE',
		'base_power_12':'POWERVARIABLE',
		'power_fraction_12':'0.5',
		'impedance_fraction_12':'0.5',
		'power_pf_12':'0.9', #TODO: we can probably get this PF data from the Milsoft loads.
		'impedance_pf_12':'0.97',
		'nominal_voltage':'120',
		'phases':'PHASESVARIABLE',
		'parent':'PARENTVARIABLE'}
	def powerClean(powerStr):
		''' take 3339.39+1052.29j to 3339.39 '''
		return powerStr[0:powerStr.find('+')]
	for key in tree:
		if tree[key].get('object','') == 'triplex_node':
			# Get existing variables.
			name = tree[key].get('name','')
			power = tree[key].get('power_12','')
			parent = tree[key].get('parent','')
			phases = tree[key].get('phases','')
			# Replace object and reintroduce variables.
			tree[key] = copy(blankZipModel)
			tree[key]['name'] = name
			tree[key]['base_power_12'] = powerClean(power)
			tree[key]['parent'] = parent
			tree[key]['phases'] = phases

	# Function to determine how low we can tap down in the CVR case:
	def loweringPotential(baseLine):
		''' Given a baseline end of line voltage, how many more percent can we shave off the substation voltage? '''
		''' testsWePass = [122.0,118.0,200.0,110.0] '''
		lower = int(math.floor((baseLine/114.0-1)*100)) - 1
		# If lower is negative, we can't return it because we'd be undervolting beyond what baseline already was!
		if lower < 0:
			return baselineTap
		else:
			return baselineTap - lower

	# Run all the powerflows.
	powerflows = []
	for doingCvr in [False, True]:
		# For each load level in the tenLoadLevels, run a powerflow with the load objects scaled to the level.
		for desiredLoad in tenLoadLevels:
			# Find the total load that was defined in Milsoft:
			loadList = []
			for key in tree:
				if tree[key].get('object','') == 'triplex_load':
					loadList.append(tree[key].get('base_power_12',''))
			totalLoad = sum([float(x) for x in loadList])
			# Rescale each triplex load:
			for key in tree:
				if tree[key].get('object','') == 'triplex_load':
					currentPow = float(tree[key]['base_power_12'])
					ratio = desiredLoad/totalLoad
					tree[key]['base_power_12'] = str(currentPow*ratio)
			# If we're doing CVR then lower the voltage.
			if doingCvr:
				# Find the minimum voltage we can tap down to:
				newTapPos = baselineTap
				for row in powerflows:
					if row.get('loadLevel','') == desiredLoad:
						newTapPos = loweringPotential(row.get('lowVoltage',114))
				# Tap it down to there.
				# TODO: do each phase separately because that's how it's done in the field... Oof.
				tree[regConfIndex]['tap_pos_A'] = str(newTapPos)
				tree[regConfIndex]['tap_pos_B'] = str(newTapPos)
				tree[regConfIndex]['tap_pos_C'] = str(newTapPos)
			# Run the model through gridlab and put outputs in the table.
			output = gridlabd.runInFilesystem(tree, keepFiles=False)
			p = output['Zregulator.csv']['power_in.real'][0]
			q = output['Zregulator.csv']['power_in.imag'][0]
			s = math.sqrt(p**2+q**2)
			lossTotal = 0.0
			for device in ['ZlossesOverhead.csv','ZlossesTransformer.csv','ZlossesUnderground.csv']:
				for letter in ['A','B','C']:
					r = output[device]['sum(power_losses_' + letter + '.real)'][0]
					i = output[device]['sum(power_losses_' + letter + '.imag)'][0]
					lossTotal += math.sqrt(r**2 + i**2)
			## Entire output:
			powerflows.append({
				'doingCvr':doingCvr,
				'loadLevel':desiredLoad,
				'realPower':p,
				'powerFactor':p/s,
				'losses':lossTotal,
				'subVoltage': (
					output['ZsubstationBottom.csv']['voltage_A'][0] + 
					output['ZsubstationBottom.csv']['voltage_B'][0] + 
					output['ZsubstationBottom.csv']['voltage_C'][0] )/3/60,
				'lowVoltage':output['ZvoltageJiggle.csv']['min(voltage_12.mag)'][0]/2,
				'highVoltage':output['ZvoltageJiggle.csv']['max(voltage_12.mag)'][0]/2 })

	# For a given load level, find two points to interpolate on.
	def getInterpPoints(t):
		''' Find the two points we can interpolate from. '''
		''' tests pass on [tenLoadLevels[0],tenLoadLevels[5]+499,tenLoadLevels[-1]-988] '''
		loc = sorted(tenLoadLevels + [t]).index(t)
		if loc==0:
			return (tenLoadLevels[0],tenLoadLevels[1])
		elif loc>len(tenLoadLevels)-2:
			return (tenLoadLevels[-2],tenLoadLevels[-1])
		else:
			return (tenLoadLevels[loc-1],tenLoadLevels[loc+1])

	# Calculate peak reduction.
	for row in monthData:
		peak = row['histPeak']
		peakPoints = getInterpPoints(peak)
		peakTopBase = [x for x in powerflows if x.get('loadLevel','') == peakPoints[-1] and x.get('doingCvr','') == False][0]
		peakTopCvr = [x for x in powerflows if x.get('loadLevel','') == peakPoints[-1] and x.get('doingCvr','') == True][0]
		peakBottomBase = [x for x in powerflows if x.get('loadLevel','') == peakPoints[0] and x.get('doingCvr','') == False][0]
		peakBottomCvr = [x for x in powerflows if x.get('loadLevel','') == peakPoints[0] and x.get('doingCvr','') == True][0]
		# Linear interpolation so we aren't running umpteen million loadflows.
		x = (peakPoints[0],peakPoints[1])
		y = (peakTopBase['realPower'] - peakTopCvr['realPower'],
			 peakBottomBase['realPower'] - peakBottomCvr['realPower'])
		peakRed = y[0] + (y[1] - y[0]) * (peak - x[0]) / (x[1] - x[0])
		row['peakReduction'] = peakRed

	# Calculate energy reduction and loss reduction based on average load.
	for row in monthData:
		avgEnergy = row['histAverage']
		energyPoints = getInterpPoints(avgEnergy)
		avgTopBase = [x for x in powerflows if x.get('loadLevel','') == energyPoints[-1] and x.get('doingCvr','') == False][0]
		avgTopCvr = [x for x in powerflows if x.get('loadLevel','') == energyPoints[-1] and x.get('doingCvr','') == True][0]
		avgBottomBase = [x for x in powerflows if x.get('loadLevel','') == energyPoints[0] and x.get('doingCvr','') == False][0]
		avgBottomCvr = [x for x in powerflows if x.get('loadLevel','') == energyPoints[0] and x.get('doingCvr','') == True][0]
		# Linear interpolation so we aren't running umpteen million loadflows.
		x = (energyPoints[0], energyPoints[1])
		y = (avgTopBase['realPower'] - avgTopCvr['realPower'],
			avgBottomBase['realPower'] - avgBottomCvr['realPower'])
		energyRed = y[0] + (y[1] - y[0]) * (avgEnergy - x[0]) / (x[1] - x[0])
		row['energyReduction'] = energyRed
		lossY = (avgTopBase['losses'] - avgTopCvr['losses'],
			avgBottomBase['losses'] - avgBottomCvr['losses'])
		lossRed = lossY[0] + (lossY[1] - lossY[0]) * (avgEnergy - x[0]) / (x[1] - x[0])
		row['lossReduction'] = lossRed

	# Multiply by dollars.
	for row in monthData:
		row['energyReductionDollars'] = row['energyReduction'] * (rates['wholesaleEnergyCostPerKwh'] - rates['retailEnergyCostPerKwh'])
		row['peakReductionDollars'] = row['peakReduction'] * rates['peakDemandCost' + row['season'] + 'PerKw']
		row['lossReductionDollars'] = row['lossReduction'] * rates['wholesaleEnergyCostPerKwh']

	# Pretty output
	def plotTable(inData):
		fig = plt.figure(figsize=(20,10))
		plt.axis('off')
		plt.tight_layout()
		plt.table(cellText=[row[1:] for row in inData[1:]], 
			loc = 'center',
			rowLabels = [row[0] for row in inData[1:]],
			colLabels = inData[0])
	def dictalToMatrix(dictList):
		''' Take our dictal format to a matrix. '''
		matrix = [dictList[0].keys()]
		for row in dictList:
			matrix.append(row.values())
		return matrix

	# Powerflow results.
	plotTable(dictalToMatrix(powerflows))

	# Monetary results.
	plotTable(dictalToMatrix(monthData))

	# Graph the money data.
	fig = plt.figure(figsize=(17,10))
	indices = [r['monthName'] for r in monthData]
	d1 = [r['energyReductionDollars'] for r in monthData]
	d2 = [r['lossReductionDollars'] for r in monthData]
	d3 = [r['peakReductionDollars'] for r in monthData]
	ticks = range(len(d1))
	plt.bar(ticks,d1,color='red')
	plt.bar(ticks,d2,color='green')
	plt.bar(ticks,d3,color='blue',yerr=d2)
	plt.xticks([t+0.5 for t in ticks],indices)
	plt.ylabel('Utility Savings ($)')

	# Graph the cumulative savings.
	fig = plt.figure(figsize=(17,8))
	annualSavings = sum(d1) + sum(d2) + sum(d3)
	annualSave = lambda x:(annualSavings - rates['omCost']) * x - rates['capitalCost']
	simplePayback = rates['capitalCost']/(annualSavings - rates['omCost'])
	plt.xlabel('Year After Installation')
	plt.xlim(0,30)
	plt.ylabel('Cumulative Savings ($)')
	plt.plot([0 for x in range(31)],c='gray')
	plt.axvline(x=simplePayback, ymin=0, ymax=1, c='gray', linestyle='--')
	plt.plot([annualSave(x) for x in range(31)], c='green')


def _scadaCleanup(meterName):
	''' Take a SCADA csv and spit out a nice monthData structure. '''

	# Meter name to code mappings:
	nameToSubcode = {'Glen':468670, 'Cambria':468706, 'Chateau':469573, 'Turtle':469616, 'Roslin':469628,
		'Lewiston':469653, 'Montello':469661, 'Doylestown':469664,'Wautoma':470190,'Plainfield':470201,
		'Hancock':470221,'Richford':470246,'Wild Rose':470284, 'Friendship':470382,'Quincy':470386,
		'Grant':470394, 'Sherwood':470396, 'SherwoodArrow':470396, 'Winnebago':470493, 'Dellwood':470508,
		'Brooks':470538, 'Spring Lake':471059, 'Coloma':471135, 'Wild Rose Pumps':558087, 'Foxhill':638717,
		'Poy Sippi':664054, 'Poysippi':664054, 'Friesland':664613, 'Friesland ACEC WPL':664614, 'Friesland WPL':664616,
		'Columbus':693716, 'Badger West':710462, 'Arrowhead':7180863, 'Lakehead':7180864}

	# MonthName -> Ordinal mapping:
	monthToOrd = {'January':1, 'February':2, 'March':3, 'April':4, 'May':5, 'June':6, 'July':7, 'August':8,
		'September':9, 'October':10, 'November':11, 'December':12 }

	# MonthName -> Season mapping:
	monthToSeason = {'January':'Winter','February':'Winter','March':'Spring','April':'Spring',
				   'May':'Spring','June':'Summer','July':'Summer','August':'Summer',
				   'September':'Fall','October':'Fall','November':'Fall','December':'Winter'}

	# Read in the COLOMA data from the tsv.
	with open('sourceData/ACECSCADA2.tsv', 'rb') as csvFile:
		scadaReader = csv.DictReader(csvFile, delimiter='\t')
		allData = [row for row in scadaReader if row['meterId']==str(nameToSubcode[meterName])]
	print allData[3]

	# Calculations on rows helper functions.
	def monthRows(monthName):
		monthNum = monthToOrd[monthName]
		if monthNum<6: return [row for row in allData if re.match(r'^' + str(monthNum) + r'/\d*/12 .*', row['timestamp'])]
		else: return [row for row in allData if re.match(r'^' + str(monthNum) + r'/\d*/11 .*', row['timestamp'])]

	def mapOnPower(monthName, inFun):
		monthData = monthRows(monthName)
		return inFun([float(row['power']) for row in monthData])

	# All monthly SCADA data:
	avg = lambda x:sum(x)/len(x)
	def roundSig(x, sig=3):
		''' Round a float to a given number of sig figs. '''
		return round(x, sig-int(math.floor(math.log10(x)))-1)
	monthData = [{'monthId':monthToOrd[m],
				  'monthName':m,
				  'season':monthToSeason[m],
				  'histPeak':roundSig(mapOnPower(m,max)*1000),
				  'histAverage':roundSig(mapOnPower(m,avg)*1000)} for m in sorted(monthToOrd, key=monthToOrd.get)]
	# Print it compactly along with PMR sanity test:
	for row in monthData: print row
	print '\nPeak to Mean Ratios', [roundSig(m['histPeak']/m['histAverage']) for m in monthData]
	return monthData


def _convertForCvr(stdPath, seqPath, outFilePath):
	''' Convert a feeder to a GLM'''
	with open(stdPath) as stdFile, open(seqPath) as seqFile:
		stdString = stdFile.read()
		seqString = seqFile.read()
	tree,xScale,yScale = milToGridlab.convert(stdString,seqString)
	with open(outFilePath,'w') as glmFile:
		glmFile.write(feeder.sortedWrite(tree))


def _tests():
	# Setup with feeder conversion (if necessary):
	for fName in ['ACEC-Friendship', 'ACEC-Coloma']:
		if not os.path.isfile('sourceData/' + fName + '.glm'):
			_convertForCvr('sourceData/' + fName + '.std','sourceData/ACEC.seq',
						   'sourceData/' + fName + '.glm')
	# Variables for all tests:
	rates = {'capitalCost': 30000,
		'omCost': 1000,
		'wholesaleEnergyCostPerKwh': 0.06,
		'retailEnergyCostPerKwh': 0.10,
		'peakDemandCostSpringPerKw': 5.0,
		'peakDemandCostSummerPerKw': 10.0,
		'peakDemandCostFallPerKw': 6.0,
		'peakDemandCostWinterPerKw': 8.0 }
	# Def and run tests:
	def testFriendship():
		tree = feeder.parse('sourceData/ACEC-Friendship.glm')
		monthData = _scadaCleanup('Friendship')
		runAnalysis(tree, monthData, rates)
	def testColoma():
		tree = feeder.parse('sourceData/ACEC-Coloma.glm')
		monthData = _scadaCleanup('Coloma')
		runAnalysis(tree, monthData, rates)
	def neoColoma():
		# tree = feeder.parse('sourceData/ACEC-Friendship.glm')
		import json
		with open("../../data/Feeder/public/ABEC Columbia.json") as inFile:
			tree = json.load(inFile)["tree"]
		monthData = _scadaCleanup('Coloma')
		runAnalysis(tree, monthData, rates)
	def neoFriendship():
		import json
		with open("../../data/Feeder/public/ABEC Frank LO.json") as inFile:
			tree = json.load(inFile)["tree"]
		monthData = _scadaCleanup("Friendship")
		runAnalysis(tree, monthData, rates)
	neoFriendship()
	# Show all plots:
	plt.show()

if __name__ == '__main__':
	# _tests()
	print _scadaCleanup("Coloma")
