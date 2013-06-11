// FUNCTIONS FOR DRAWING:

	function draw() {
		// d3.js bookkeeping to set what happens on each time tick in the simulation:
	
		force.on('tick', function() {
			vis.selectAll('line.link')
				.attr('x1', function(d) { return d.source.x; })
				.attr('y1', function(d) { return d.source.y; })
				.attr('x2', function(d) { return d.target.x; })
				.attr('y2', function(d) { return d.target.y; });
			vis.selectAll('.node')
			.attr("fixed", function(d){ return d.fixed =true }) // fixed a node
			.attr("transform", function(d) { return 'translate(' + d.x + ',' + d.y + ')' });
		});
	
		var name2nodeIndex = {}
		if (nodes.length == 0) {
			// Go through the first time and set up the nodes with indices:
			for (x in tree) {
				if ((tree[x].name != undefined || tree[x].module != undefined) && tree[x].from == undefined) {
					//TODO: Think about allowing access to other objects here.
					nodeName = tree[x].name
					nodeObject = tree[x].object
					x_pixel = tree[x].latitude
					y_pixel = tree[x].longitude
					if (nodeObject == 'triplex_meter'){
						for (i in tree){
							if (tree[i].to == tree[x].name){
								x_pixel = tree[i].latitude + Math.random() * 20 - 10
								y_pixel = tree[i].longitude + Math.random() * 20 - 10
							}
						}
					}
					// Generate triplex_node position, but in this case, it will remain random, since all the parent node are not assigned the position
					if (nodeObject == 'triplex_node'){
						for (i in tree){
							if (tree[i].name == tree[x].parent){
								x_pixel =  tree[i].latitude + Math.random() * 20-5 
								y_pixel =  tree[i].longitude + Math.random() * 10-5
							}
						}
					}
					// Hack to make sure electrical nodes are classed differently than graph nodes for coloring purposes:
					if (nodeObject == 'node') 
						nodeObject = 'gridNode'
					if (undefined != tree[x].bustype && tree[x].bustype == 'SWING') 
						nodeObject += ' swingNode'
					nodeIndex = nodes.length
					nodes.push({
						name : nodeName,
						treeIndex : parseInt(x),
						objectType : nodeObject,
						chargeMultiple : 1,
						x : x_pixel,
						y : y_pixel })
					name2nodeIndex[nodeName] = nodeIndex
				}
			}


			// Go through a second time and set up the links:
			for (x in tree) {
				if (tree[x].name != undefined) {
					if (tree[x].from != undefined && tree[x].to != undefined) {
						name2nodeIndex[tree[x].name] = links.length
						links.push({
							// TODO: only need to insert index of node
							source:name2nodeIndex[tree[x].from],
							target:name2nodeIndex[tree[x].to],
							treeIndex:parseInt(x),
							objectType:'fromTo' })
					} else if (tree[x].parent != undefined) {
						links.push({
							source:name2nodeIndex[tree[x].name],
							target:name2nodeIndex[tree[x].parent],
							objectType:'parentChild'})
					}
				}
			}    
		}
		// This makes a fancy fade-in.
		vis.style('opacity', 1e-6)
			.transition()
			.duration(1500)
			.style('opacity', 1);
		// Start the layout.
		force.start();
		// Run the layout in the background until performance is acceptable.
		// preLayout()
		// Start drawing.
		// redraw()
	} // end of function draw()

	function drawScaleRuler(){
		var domain_size = 20
		var padding = 20
		var size =  100
		
		var xScale = d3.scale.linear().domain([ 0, size * shrinkSize ]).range([ 0, size ]);

		//Define X axis
		var xAxis = d3.svg.axis().scale(xScale).orient("top").ticks(3);

		//Create SVG element
		var svg = vis.append('svg:g').attr('width', 300).attr('height', 100);
		//Create X axis
		svg.append("g")
			.attr("class", "axis")
			.attr('x', 300)
			.attr('y', 800)
			.attr("transform", "translate("+ (300) +"," + (800) + ")")
			.call(xAxis);
	} // end of function drawScaleRuler()

	function redraw() {
		link = d3.select('#linkLayer').selectAll('line.link').data(links, function(d) {return d.source.treeIndex + '-' + d.target.treeIndex})

		link.enter().append('svg:line')
			.on('click', onCompClick)
			.attr('class', function(d) { return 'link ' + d.objectType })
			.attr('id', function(d) { return 'n' + d.treeIndex })
			.style('stroke-width', function(d) { return Math.sqrt(d.value); })

		link.exit().remove()

		node = vis.selectAll('.node').data(nodes, function(d) {return d.treeIndex}).enter()
			.append("g")
			.call(force.drag)
			.attr('class', function(d) {return 'node ' + d.objectType})
			.attr('id', function(d) {return 'n' + d.treeIndex})
			.on('click', onCompClick)
			.on('mouseover', onCompClick) // TODO: need a new function to listen mouseover event
		
		node.append("svg:text")
	        .attr("class", "nodetext")
	        .attr("dx", 12)
	        .attr("dy", ".35em")
	        .text(function(d) { return d.objectType });
	    // var currentScale = d3.event.scale;
	    // var currentScale = d3.bahavior.scale()

		// Put the main circle on there, sized according to its size.
		node.append('svg:circle')
			.attr('id', function(d) {return 'circ' + d.treeIndex})
			.attr('class', 'nodeCircle')
			.attr('cx', 0)
			.attr('cy', 0)
			// 
			.attr('r', function(d) {return d.chargeMultiple * 10  })

		// Pinning indicator.
		node.append('svg:circle')
			.attr('class', function(d) {if(d.fixed) {return 'nodeIsPinned'} else {return 'nodeNotPinned'}})
			.attr('id', function(d) {return 'pin' + d.treeIndex})
			.attr('cx', 0)
			.attr('cy', 0)
			.attr('r', 3 )


		// Get rid of deleted nodes.
		vis.selectAll('.node').data(nodes, function(d) {return d.treeIndex}).exit().remove()

		// Update sizes
		vis.selectAll('.nodeCircle').data(nodes, function(d) {return d.treeIndex}).attr('r', function(d) {return d.chargeMultiple * 10})
		force.start()

	} // end of function redraw()

	function zoomRedraw() {
		// console.log('here', d3.event.translate, d3.event.scale);
		vis.attr(
					'transform',
					'translate(' + d3.event.translate + ')' + ' scale('
							+ d3.event.scale + ')').selectAll('.node').style(
					"stroke-width", 1 / d3.event.scale).selectAll(
					'circle.nodeIsPinned').style('stroke-width',
					2.5 / d3.event.scale)
		vis.selectAll('.nodeCircle').data(nodes, function(d){return d.treeIndex})
			.attr('r', function(d){return d.chargeMultiple * 10/d3.event.scale});
		vis.selectAll('nodeIsPinned').data(nodes, function(d){return d.treeIndex})
			.attr('r', function(d){return 3/d3.event.scale});
		vis.selectAll('line.link').style("stroke-width", 6/ d3.event.scale)
		vis.selectAll('nodetext').attr('dx', 12/d3.event.scale).attr('offsetLeft', 0)
		vis.selectAll('text').style('font-size', 30/d3.event.scale)
		vis.selectAll('.axis').style('font-size', 11/d3.event.scale)
		// vis.selectAll('.axis').ticks(3/d3.event.scale)
		// return d3.event.scale
	}


	function preLayout() {
		// function fiveTicks() {for (i=0; i<5; ++i) force.tick()}
		fiveTicksTime = 10
		// while performance is bad keep rendering in the background:
		while (fiveTicksTime > 200) {
			fiveTicksTime = time(fiveTicks)
			console.log(fiveTicksTime)
		}
	}

	function zoom(x,y,s) {
		zoomer.translate([x,y]).scale(s);
		vis.transition().duration(1000).attr('transform','translate(' + x + ',' + y + ') scale(' + s + ')')
	}

	function zoomReset() {
		// TODO: rework our algorithm so we can zoom to fill the screen with the graph, not just go back to zoom level zero.
		zoom(0,0,1)
	}

	function zoomToSelection() {
		domTargets = document.getElementsByClassName('selected')
		if (domTargets.length != 1) {return false}
		if (domTargets[0].nodeName == 'line') {
			x = getSelectedLink()['source']['x']
			y = getSelectedLink()['source']['y']
		}
		else {
			x = getSelectedNode()['x']
			y = getSelectedNode()['y']
		}
		// Zooming to a node's coordinates puts the node in the upper-left corner of the svg, 
		// and the fudge factor was worked out from that.
		zoom(-1*x+graphSvg.clientWidth/2, -1*y+graphSvg.clientHeight/2, 1)
	}

	function getCenterCoordinates() {
		try {
			x = zoomer.translate()[0]
			y = zoomer.translate()[1]
			s = 1/zoomer.scale()
			xMod = graphSvg.clientWidth/2
			yMod = graphSvg.clientHeight/2
			return [s*(xMod-x), s*(yMod-y)]
		} catch(err) {
			// Probably haven't transformed yet.
			return [0,0]
		}
	}

	// SELECT AND SEARCH FUNCTIONS

	function onCompClick(d, i) {
		function classify(d, c) {
			svg = d3.select('#graphSvg')
			// turn off the old styled one, then style the new one
			svg.select('.' + c).classed(c, false);
			svg.select("#n" + d.treeIndex).classed(c, true);
		}
		// Start showing the table.
		gebi('selected').className = ''
		// Abort if we try to select a parentChild relationship.
		if (d.objectType == 'parentChild') return false;
		// Multiselection case handled first:
		if (d3.event != null && d3.event.altKey) {
			classify(d,'multiselected')
			return false
		}
		console.log(['treeIndex=' + d.treeIndex,'name=' + d.name,'obType=' + d.objectType])
		// Visually identify the selected node.
		classify(d,'selected')
		// clear the selected table
		table = gebi('selected')
		tableClear(table)
		treeData = tree[d.treeIndex]
		for (prop in treeData) {
			if (prop == 'object' || prop == 'module') {
				row = gebi('selHead').insertRow(0)
			} else if (prop != 'from' && prop != 'to' && prop != 'parent' && prop != 'file') { // Avoid editing machine-written properties!
				row = gebi('selBody').insertRow(-1)
			} else {
				row = null
			}
			try {
				row.insertCell(0).innerHTML = prop
				row.insertCell(1).innerHTML = treeData[prop]
			} catch(err) {
			//Catch: row was null.
			}
		}
		row = table.insertRow(-1)
		cell = row.insertCell(0)
		cell.colSpan = 2
		cell.innerHTML = '<button type="button" onclick="editObject(' + d.treeIndex + ')">Edit</button>'
	} // end of function onCompClick

	// function mouseoverFunction(d,i){
	// 	vis.append('div')
	// 	.text(d.objectType)
	// 	.style("position", "absolute")
	// 	.style("z-index", "10")
	// 	.style("visibility", "visible")
	// 	showProgressDialog(d.objectType)
	// 	setTimeout(showProgressDialog, 1000)
	// }

	function clearSelection() {
		try {
			svg.select('.selected').classed('selected',false)
			svg.select('.multiselected').classed('multiselected',false)    
		} catch(err) {
			// ignore the error we get because we use svg before we define it--it'll be generated very fast after page load.
		}
		tableClear(gebi('selected'))
		gebi('selected').className = 'noSelection'
	}

	function selectViaTreeIndex(treeIndex) {
		if (tree[treeIndex].hasOwnProperty('from')) {
			// That particular tree item is a link:
			linkI = findIndex(links,'treeIndex',treeIndex)
			onCompClick(links[linkI],linkI)
		} else if (tree[treeIndex].hasOwnProperty('object') && tree[treeIndex]['object'] != 'player'){
			// Or it's a node:
			nodeI = findIndex(nodes,'treeIndex',treeIndex)
			onCompClick(nodes[nodeI],nodeI)
		} else {
			// Degenerate case: object without visual representation.
		}
	}

	function onSvgBlankCanvasClick() {
		if (window.event.toElement.tagName == 'svg') 
			clearSelection()
	}

	function getSelectedNode() {
		try {
			hits = document.getElementsByClassName('selected')
			nodeIndex = findIndex(nodes, 'treeIndex', hits[0]['id'].substr(1))
			return nodes[nodeIndex]
		} catch(err) {
			// We had no selection, or the selection wasn't in the links.
			return undefined
		}
	}

	function getAltSelectedNode() {
		try {
			hits = document.getElementsByClassName('multiselected')
			nodeIndex = findIndex(nodes, 'treeIndex', hits[0]['id'].substr(1))
			return nodes[nodeIndex]
		} catch(err) {
			// We had no selection, or the selection wasn't in the links.
			return undefined
		}
	}

	function getSelectedLink() {
		try {
			hits = document.getElementsByClassName('selected')
			linkIndex = findIndex(links, 'treeIndex', hits[0]['id'].substr(1))
			return links[linkIndex]
		} catch(err) {
			// We had no selection, or the selection wasn't in the links.
			return undefined
		}
	}

	function hotkeys() {
		// IE8 and earlier
		if(window.event) {x = event.keyCode}
		// IE9/Firefox/Chrome/Opera/Safari
		else if(event.which) {x = event.which}
		keychar = String.fromCharCode(x);
		// Dispatch the key:
		if (keychar == 'p') {toggleSelectedPin()}
		else if (keychar == 'f') {foldAtSelected()}
		else if (keychar == 'u') {unfoldAtSelected()}
	}

	function findElementsViaString(inString) {
		results = []
		for (key in tree) {
			subIndex = JSON.stringify(tree[key]).indexOf(inString)
			if (subIndex != -1 && tree[key]['object'] != 'player' && tree[key].hasOwnProperty('object') ) {
			results.push(key)
			}
		}
		return results
	}

	// Public variable to hold the current search state. TODO: put in a closure.
	var searchCursor
	var oldSearchTerm

	function findNext() {
		term = gebi('searchTerm').value
		if (oldSearchTerm != term) {
			oldSearchTerm = term
			searchCursor = undefined
		}
		hits = findElementsViaString(term)
		gebi('searchHitCount').innerHTML = hits.length + ' Hits'
		if (hits.length == 0) {return false}
		if (searchCursor == undefined) {
			selectViaTreeIndex(hits[0])
			searchCursor = 0
		} else {
			searchCursor++
			if (searchCursor == hits.length) {searchCursor = 0}
			if (searchCursor == -1) {searchCursor = hits.length-2}
			selectViaTreeIndex(hits[searchCursor])
		}
		zoomToSelection()
	}

	function findPrevious() {
		if (searchCursor == undefined) {
			findNext()
		} else {
			searchCursor -= 2
			findNext()
		}
	}

	// EDITING AND REMOVING COMPONENTS FUNCTIONS
	
	function editObject(treeIndex) {
		$(document).on("keydown", "input", function(e){
			$(this).css("border", "0px");
		});
		table = gebi('selected')
		//Make all the boxes editable.
		for (i = 1; i < table.rows.length - 1; i++) {
			cell = table.rows[i].cells[1]
			oldContent = cell.innerHTML
			cell.innerHTML = '<input type="text" name="null" data-old="' + oldContent + '" value="' + oldContent + '"/>'
		}
		//Put the save/cancel buttons in 			return true
		//Put the save/cancel buttons in there with the right index.
		table.deleteRow(-1);
		bump_buttons_down(table, treeIndex);
		
		//Put a delete button in.
		gebi('selHead').rows[0].cells[1].innerHTML += '<button class="deleteButton" onclick="deleteObject(' + treeIndex + ')">Delete</button>'
		gebi('selHead').rows[0].cells[1].innerHTML += '<button class="deleteButton" onclick="add_attr(' + treeIndex + ')">Add attribute</button>'
	}

	function bump_buttons_down(table, treeIndex){
		bottomRow = table.insertRow(-1)
		bottomRow.insertCell(0).innerHTML = '<button type="button" onclick="saveEdits(' + treeIndex + ')">Save</button>'
		bottomRow.insertCell(1).innerHTML = '<button type="button" onclick="cancelEditing(' + treeIndex + ')">Cancel</button>'
	}

	// function check_attr_names(){
	// 	var t = false;
	// 	var all_attr_names = $(".new_attr_name")
	// 	var i;
	// 	for(i=0; i<all_attr_names.length; i++){
	// 	    var an = all_attr_names[i];
	// 	    if (an.value == ""){

	// 		t = true;
	// 	    }
	// 	}
	// 	return t;
	// }

	function blank_inputs(input){
		return input.parentElement.nodeName == "TD" && input.name == "null" && input.value == "";
	}

	function new_at(input){
		return input.value == "";
	}
	
	function validate_blanks(arry, func_arry){
		var stop = false;
		var t = true;
		// var all_inputs = $("input");
		// console.log(all_inputs);
		var i, j;
		for (j=0; j<arry.length; j++){
			ary = arry[j];
			func = func_arry[j];
			for(i=0; i< ary.length; i++){
				var input = ary[i];
				// console.log(input);
				// console.log(input.value);
				if (func(input)){
					$(input).css("border", "1px solid red");
					console.log($(input));
					if(t){
						$(input).focus();
						t = false;
					}
					stop = true;
				}else{
					$(input).css("border", "");
				}
			}
		}
		return stop;
	}
	
	function add_attr(treeIndex){
		if(validate_blanks([$(".new_attr_name"), $(".new_attr_value")], [new_at, new_at])){
			alert("Give the highlighted attributes a name and value before you make a new one!");
			return;
		}
		var table = gebi('selected');
		table.deleteRow(-1);
		$("#selected").append($("<tr>")
					  .attr("class", "new_attr_row")
					  .append($("<td>")
						  .append($("<button>")
							  .html("X")
							  .click(function(e){
							  $(this).parent().parent().remove()
							  })
							  .addClass("deleteButton")
							  .css("float", "left"))
						  
						  
						  .append($("<input>")
							  .css("display", "inline")
							  .attr("type", "text")
							  .attr("placeholder", "New Attribute")
							  .attr("class", "new_attr_name")
							  .attr("id", "focus_me")))

					  .append($("<td>")
						  .append($("<input>")
							  .attr("type", "text")
							  .attr("class", "new_attr_value")
							  .attr("placeholder", "New Attribute's value"))));
		bump_buttons_down(table, treeIndex);
		$("#focus_me").focus();
	}
	
	function saveEdits(treeIndex) {
		if(validate_blanks([$("input"),
					$(".new_attr_name"),
					$(".new_attr_value")],
				   [blank_inputs, new_at, new_at])){				   
			alert("Don't leave stuff blank pal!");
			return;
		}
			
			
		function isNameAlreadyUsed(testValue) {
			// Helper function to make sure we don't make non-unique names.
			for (leaf in tree) {
				for (attrKey in tree[leaf]) {
					if (attrKey == 'name' && tree[leaf][attrKey] == testValue) {
						return true
					}
				}
			}
			return false
		}
		table = gebi('selected')
		// check for node or link:
		treeObject = tree[treeIndex]
		for (i = 1; i < table.rows.length - 1; i++) {
			var k = table.rows[i].cells[0];
			// key = k.firstElementChild && k.firstElementChild.nextElementSibling.nodeName == "INPUT" ? k.firstElementChild.value : k.innerHTML;
			key = $(k).children("input").length > 0 ? $(k).children("input").val() : k.innerHTML;
			console.log(key);
			console.log(k.nodeName);
			cell = table.rows[i].cells[1]
			oldValue = cell.childNodes[0].getAttribute('data-old')
			// if we are adding a completely new attribute, there would be no oldValue
			newValue = cell.childNodes[0].value
			// Names are GUIDS and so are strongly constrained. Make sure we're okay with the name change:
			if (key=='name') {
				// 1. If the name is already the name of something else, skip the renaming.
				if (isNameAlreadyUsed(newValue) && oldValue != newValue) {
					cell.innerHTML = oldValue
					alert('Please choose a unique name.')
				}
				else {
					treeObject[key] = newValue
					cell.innerHTML = newValue
					// 2. If the name is unique, go through EVERY attribute in the tree and replace the old name with the new one.
					for (leaf in tree) {
						for (attrKey in tree[leaf]) {
							if (oldValue == tree[leaf][attrKey]) {
								console.log(tree[leaf]); 
								tree[leaf][attrKey] = newValue
							}
						}
					}
					// 3. Go through the nodes and replace the name there too. UGH!
					nodeIndex = findIndex(nodes, 'name', oldValue)
					if (nodeIndex != "") {nodes[nodeIndex]['name'] = newValue}
				}
			}
			else {
				treeObject[key] = newValue
				cell.innerHTML = newValue
				k.innerHTML = key;
			}
		}
		table.deleteRow(-1)
		row = table.insertRow(-1)
		cell = row.insertCell(0)
		cell.colSpan = 2
		cell.innerHTML = '<button type="button" onclick="editObject(' + treeIndex + ')">Edit</button>'
		remove_del_buttons();
		// delButton = gebi('selHead').rows[0].cells[1].children[0]
		// delButton.parentNode.removeChild(delButton)
	}

	function cancelEditing(treeIndex) {
		table = gebi('selected')
		for (i = 1; i < table.rows.length - 1; i++) {
			cell = table.rows[i].cells[1]
			old = cell.childNodes[0].getAttribute('data-old')
			cell.innerHTML = old
		}
		table.deleteRow(-1)
		row = table.insertRow(-1)
		cell = row.insertCell(0)
		cell.colSpan = 2
		cell.innerHTML = '<button type="button" onclick="editObject(' + treeIndex + ')">Edit</button>'
		// delButton = gebi('selHead').rows[0].cells[1].children[0]
		remove_del_buttons();
		$(".new_attr_row").remove();
	}

	function remove_del_buttons(){
		var all_dels = gebi('selHead').getElementsByClassName("deleteButton");
		while(all_dels.length > 0){
			$(all_dels[0]).remove();    
		}
	}

	
	function deleteObject(treeIndex) {
		// Figure out whether we have a node or an link:
		var isNode = true
		for (prop in tree[treeIndex]) if (prop == 'from') isNode = false
		if (isNode) {
			// Check for connections and abort if we have them.
			nodeName = tree[treeIndex].name
			for (indexVar in tree) {
				if (tree[indexVar].from == nodeName || tree[indexVar].to == nodeName || tree[indexVar].parent == nodeName) {
					alert('We can only delete nodes that aren\'t connected')
					return false
				}
			}
			// No connection, so delete the node:
			var nodeIndex
			for (x=0;x<nodes.length;x++) {
				if (nodes[x].treeIndex == treeIndex) nodeIndex = x
			}
			nodes.splice(nodeIndex,1)
			// If we have a parent child situation, delete the link:
			if (tree[treeIndex].parent != undefined) {
			var linkIndex
			for (x=0;x<links.length;x++) {
				if (links[x].source.name == nodeName) linkIndex = x
			}
			links.splice(linkIndex,1)
			}
		} else {
			// Delete link:
			var linkIndex
			for (x=0;x<links.length;x++) {
			if (links[x].treeIndex == treeIndex) linkIndex = x
			}
			links.splice(linkIndex,1)
		}
		// Delete tree object:
		delete tree[treeIndex]
		clearSelection()
		redraw()  
	}

	function nextTreeKey() {
		keyList = Object.keys(tree)
		max = 0
		for (x in keyList) {intKey = parseInt(keyList[x]); if (intKey > max) max = intKey}
		return max + 1
	}

	function findIndex(inOb,field,val) {
		for (key in inOb) {if (inOb[key][field]==val) {return key}}
		// if we can't find an index:
		return ''
	}

	// ADDING COMPONENTS FUNCTIONS

	function fillComponentMenu() {
		newObjectMenu = gebi('newObjectMenu')
		for (component in components) {
			if (undefined == components[component]['from'] && undefined == components[component]['parent']) {addingFunctionName = 'newNode'}
			else if (undefined == components[component]['from']) {addingFunctionName = 'newChildAtSelected'}
			else {addingFunctionName = 'newLink'}
			newObjectMenu.innerHTML += ('<li><a href="javascript:' + addingFunctionName + '(\'' + component + '\')">' + component + '</a></li>')
		}
	}

	function newNode(componentName) {
		// Get the stuff we need.
		component = clone(components[componentName])
		treeNewIndex = nextTreeKey()
		// Put the component in the tree with a new name.
		tree[treeNewIndex] = component
		tree[treeNewIndex].name = componentName + String(treeNewIndex)
		// Add to the nodes.
		newType = component.object
		// Hack to make sure we color nodes correctly:
		if (newType == 'node') newType = 'gridNode'
		if (undefined != tree[treeNewIndex].bustype && tree[treeNewIndex].bustype == 'SWING') newType += ' swingNode'
		coords = getCenterCoordinates()
		nodeToAdd = {name:component.name, objectType:newType, treeIndex:treeNewIndex, chargeMultiple:1, fixed:true, x:coords[0], y:coords[1], px:coords[0], py:coords[1]}
		nodes.push(nodeToAdd)
		// zoomRedraw()
		redraw()
	}

	function newLink(componentName) {
		// Fail if we have an incorrect selection.
		function alreadyLinked(nodeName1, nodeName2) {
			for (linkId in links) {
				sourceName = links[linkId].source.name
				targetName = links[linkId].target.name
				if ((nodeName1 == sourceName && nodeName2 == targetName) 
					|| (nodeName1 == targetName && nodeName2 == sourceName)) {
					return true
				}
			}
			return false
		}

		try {
			selectedName = getSelectedNode()['name']
			altSelectedName = getAltSelectedNode()['name']
		} catch(err) {
			// Key error!
			selectedName = undefined
			altSelectedName = undefined
		}
		if (undefined == selectedName || undefined == altSelectedName || selectedName == altSelectedName || alreadyLinked(selectedName, altSelectedName)) {
			alert('I am sorry, but we cannot insert a link there.')
			return false
		}
		// Get the stuff we need.
		component = clone(components[componentName])
		treeNewIndex = nextTreeKey()
		// Make sure component's to and from are set.
		component['from'] = selectedName
		component['to'] = altSelectedName
		// Put the component in the tree with a new name.
		tree[treeNewIndex] = component
		tree[treeNewIndex].name = componentName + String(treeNewIndex)
		// TODO: make absolutely sure we're not clobbering a name. We should just come up with a unique naming convention.
		// Add to the links.
		linkToAdd = {source:nodes[findIndex(nodes,'name',selectedName)], target:nodes[findIndex(nodes,'name',altSelectedName)], treeIndex:treeNewIndex, objectType:'fromTo'}
		links.push(linkToAdd)
		redraw()
		// zoomRedraw()
	} // end of function newLink

	function newChildAtSelected(componentName) {
		if (undefined == getSelectedNode()) {
			alert('I am sorry, but we cannot insert a child element there.')
			redraw()
			return false
		}
		// Get the stuff we need.
		component = clone(components[componentName])
		newChildAtLocation(component, getSelectedNode()['treeIndex'])
		redraw()
		// zoomRedraw()
	}

	function newChildAtLocation(component,treeIndex) {
		treeNewIndex = nextTreeKey()
		// Make sure component's parent is set.
		component['parent'] = tree[treeIndex]['name']
		// Put the component in the tree with a new name.
		tree[treeNewIndex] = component
		newName = component['object'] + String(treeNewIndex)
		tree[treeNewIndex].name = newName
		// TODO: make absolutely sure we're not clobbering a name. We should just come up with a unique naming convention.
		// Add to the nodes.
		nodeToAdd = {name:component.name, 
					objectType:component.object, 
					treeIndex:treeNewIndex, 
					chargeMultiple:1}
		nodes.push(nodeToAdd)
		// Add to the links.
		linkToAdd = {source:nodes[findIndex(nodes,'name',newName)], 
					target:nodes[findIndex(nodes,'name',tree[treeIndex]['name'])], 
					// treeIndex:treeNewIndex,
					objectType:'parentChild'}
		links.push(linkToAdd)
	}

	function staticLoadsToHouses() {
		function randomHouse() {
			newHouse = {}
			newHouse['object'] = 'house'
			newHouse['air_temperature'] = '70'
			newHouse['cooling_COP'] = randomInt(25,40)/10.0 + ''
			newHouse['cooling_setpoint'] = 'cooling' + randomInt(1,8) + '*1'
			newHouse['cooling_system_type'] = randomChoice(['ELECTRIC', 'HEAT_PUMP', 'NONE'])
			// House sizing distribution from http://www.census.gov/housing/ahs/
			// between 1100 and 3000. Probably needs a normal distribution.
			area = 1800 + 500*randomGaussian()
			if (area < 500) {area = 500}
			area = area.toPrecision(2) * 1.0 + ''
			newHouse['floor_area'] = area
			newHouse['heating_COP'] = randomInt(20,35)/10.0 + ''
			newHouse['heating_setpoint'] = 'heating' + randomInt(1,8) + '*1'
			newHouse['heating_system_type'] = randomChoice(['RESISTANCE', 'HEAT_PUMP', 'GAS'])
			newHouse['mass_temperature'] = '70'
			skew = 1200*randomGaussian()
			skew = skew.toPrecision(3) * 1.0 + ''
			newHouse['schedule_skew'] = skew
			newHouse['thermal_integrity_level'] = randomChoice([1,2,2,2,3,3,3,4,4,4,4,4,4,5,5,5,5,5,5,5,6,6,6]) + ''
			treeNewIndex = nextTreeKey()
			newHouse['name'] = 'synhouse' + treeNewIndex
			
			redraw()
			// zoomRedraw()
			return newHouse
		}
		function randomLights() {
			newLights = {}
			newLights['object'] = 'ZIPload'
			newLights['power_fraction'] = '0.400000'
			newLights['current_fraction'] = '0.300000'
			newLights['impedance_pf'] = '1.000'
			newLights['current_pf'] = '1.000'
			newLights['power_pf'] = '1.000'
			newLights['impedance_fraction'] = '0.300000'
			newLights['heatgain_fraction'] = '0.9'
			power = 1.2 + randomGaussian()
			if (power < 0) {power = -1*power}
			power = power.toPrecision(3) * 1.0 + ''
			newLights['base_power'] = 'LIGHTS*' + 1.33
			skew = 2000*randomGaussian()
			skew = skew.toPrecision(3) * 1.0 + ''
			newLights['schedule_skew'] = skew
			treeNewIndex = nextTreeKey()
			newLights['name'] = 'synLights' + treeNewIndex
			return newLights
		}
		function randomWaterHeater() {
			newHeater = {}
			if (randomChoice([1,2,3]) == 3) {return false}
			// Static properties.
			newHeater['object'] = 'waterheater'
			newHeater['temperature'] = '135'
			newHeater['tank_volume'] = '50'
			newHeater['location'] = 'INSIDE'
			// Uniformly distributed properties.
			newHeater['heating_element_capacity'] = randomInt(37,53)/10.0 + ''
			newHeater['thermostat_deadband'] = randomInt(20,60)/10.0 + ''
			newHeater['demand'] = 'water' + randomInt(1,20) + '*1'
			newHeater['tank_UA'] = randomInt(20,40)/10.0 + ''
			// Gaussian properties.
			skew = 2000*randomGaussian()
			skew = skew.toPrecision(3) * 1.0 + ''
			newHeater['schedule_skew'] = skew
			newHeater['tank_setpoint'] = (randomGaussian()*2+130).toPrecision(3) + ''
			// between 1100 and 3000. Probably needs a normal distribution.
			treeNewIndex = nextTreeKey()
			newHeater['name'] = 'synwaterheater' + treeNewIndex
			return newHeater
		}
		function replaceAllHouses() {
			for (index in tree) {
				if (tree[index].hasOwnProperty('object') && tree[index].hasOwnProperty('parent') && tree[index]['object']=='triplex_node') {
					// console.log(tree[index])
					parentIndex = findIndex(tree, 'name', tree[index]['parent'])
					deleteObject(index)
					newHouse = randomHouse()
					newLights = randomLights()
					newHeater = randomWaterHeater()
					newChildAtLocation(newHouse, parentIndex)
					houseIndex = findIndex(tree, 'name', newHouse['name'])
					newChildAtLocation(newLights, houseIndex)
					if (newHeater!=false) {newChildAtLocation(newHeater, houseIndex)}
				}
			}
			redraw()
			removeProgressDialog()
		}
		showProgressDialog('Please wait. Houses are being generated.')
		// HACK: we do this extra timeout so the DOM gets execution priority and redraws the page.
		setTimeout(replaceAllHouses, 500);
	} // end of function staticLoadsToHouses

	function solarAdding() {
		solarPerc = gebi('solarAddingPercentage').value/100.0
		function makeNewInverter(phases) {
			newInverter = {}
			newInverter['object'] = 'inverter'
			newInverter['phases'] = phases
			newInverter['generator_status'] = 'ONLINE'
			newInverter['inverter_type'] = 'PWM'
			newInverter['generator_mode'] = 'CONSTANT_PF'
			treeNewIndex = nextTreeKey()
			newInverter['name'] = 'synInverter' + treeNewIndex
			return newInverter
		}
		function newRandomPanels() {
			newPanels = {}
			newPanels['object'] = 'solar'
			newPanels['generator_mode'] = 'SUPPLY_DRIVEN'
			newPanels['generator_status'] = 'ONLINE'
			newPanels['panel_type'] = 'SINGLE_CRYSTAL_SILICON'
			newPanels['efficiency'] = '0.1' + randomInt(0,5)
			newPanels['area'] = randomInt(2,8) + '00 sf'
			treeNewIndex = nextTreeKey()
			newInverter['name'] = 'synSolar' + treeNewIndex
			return newPanels
		}
		function walkAndAddSolar() {
			for (index in tree) {
				if (tree[index].hasOwnProperty('object') && tree[index]['object']=='house') {
					if (Math.random() < solarPerc) {
					meterIndex = findIndex(tree, 'name', tree[index]['parent'])
					newInverter = makeNewInverter(tree[index]['phases'])
					newPanels = newRandomPanels()
					newChildAtLocation(newInverter, meterIndex)
					inverterIndex = findIndex(tree, 'name', newInverter['name'])
					newChildAtLocation(newPanels, inverterIndex)
					}
				}
			}
			redraw()
			removeProgressDialog()
		}
		showProgressDialog('Please wait. Solar is being generated.')
		// HACK: we do this extra timeout so the DOM gets execution priority and redraws the page.
		setTimeout(walkAndAddSolar, 500);
	} // end of function solarAdding

	// MODEL SAVING

	function saveModel() {
		feederObject = {
						tree:tree,
						nodes:nodes,
						hiddenNodes:hiddenNodes,
						links:links,
						hiddenLinks:hiddenLinks,
						layoutVars:{'gravity':force.gravity(),
									'theta':force.theta(),
									'friction':force.friction(),
									'linkStrength':force.linkStrength()},
						attachments:attachments
						}
		payload = {'name':gebi('gridName').innerHTML, 'feederObjectJson':JSON.stringify(feederObject, null, '    ')}
		post_to_url('/saveFeeder/', payload)
	}

	function rename() {
		gebi('renameMenuItem').style.display = 'none'
		gebi('saveMenuItem').style.display = 'none'
		gridNameP = gebi('gridName')
		currentName = gridNameP.innerHTML
		inputBox = '<input type="text" id="gridNameEdit" name="gridNameEdit" data-old="' + currentName + '" value="' + currentName + '"/>'
		acceptButton = '<button class="smallButton" id="acceptButton" onclick="acceptRename()">✔</button>'
		cancelButton = '<button class="smallButton" id="cancelButton" onclick="cancelRename()">✘</button>'
		gridNameP.innerHTML = inputBox + acceptButton + cancelButton
	}

	function cancelRename() {
		gebi('renameMenuItem').style.display = 'block'
		gebi('saveMenuItem').style.display = 'block'
		gridNameP = gebi('gridName')
		oldName = gebi('gridNameEdit').getAttribute('data-old')
		gridNameP.innerHTML = oldName
	}

	function acceptRename() {
		gebi('renameMenuItem').style.display = 'block'
		gebi('saveMenuItem').style.display = 'block'
		gridNameP = gebi('gridName')
		newName = gebi('gridNameEdit').value
		gridNameP.innerHTML = newName
	}

	// PINNING FUNCTIONS

	function pinAll() {
		for (node in nodes) {
			gebi('pin' + nodes[node].treeIndex).setAttribute('class','nodeIsPinned')
			nodes[node].fixed = true
		}
		for (hNode in hiddenNodes) {
			gebi('pin' + hiddenNodes[hNode].treeIndex).setAttribute('class','nodeIsPinned')
			hiddenNodes[hNode].fixed = true
		}
		force.start()
	}

	function unPinAll() {
		for (node in nodes) {
			gebi('pin' + nodes[node].treeIndex).setAttribute('class','nodeNotPinned')
			nodes[node].fixed = false
		}
		for (hNode in hiddenNodes) {
			gebi('pin' + hiddenNodes[hNode].treeIndex).setAttribute('class','nodeNotPinned')
			hiddenNodes[hNode].fixed = false
		}
		force.start()
	}

	function toggleSelectedPin() {
		selNode = getSelectedNode()
		pinCircle = gebi('pin' + selNode.treeIndex)
		if (pinCircle.getAttribute('class') == 'nodeIsPinned') {
			pinCircle.setAttribute('class','nodeNotPinned')
			selNode.fixed = false
		} else {
			pinCircle.setAttribute('class','nodeIsPinned')
			selNode.fixed = true
		}
		force.start()
	}

	// LAYOUT MENU FUNCTIONS

	function layoutMenuInit() {
		nodeCount = nodes.length + hiddenNodes.length
		gebi('nodesBox').innerHTML = nodeCount
		gebi('nodesPercShown').style.width = nodes.length*100/nodeCount + '%'
		gebi('nodesPercHidden').style.width = hiddenNodes.length*100/nodeCount + '%'
		gebi('gravityBox').value = force.gravity()
		gebi('thetaBox').value = force.theta()
		gebi('frictionBox').value = force.friction()
		gebi('linkStrengthBox').value = force.linkStrength()
	}

	function layoutMenuApply() {
		force.gravity(gebi('gravityBox').value)
		force.theta(gebi('thetaBox').value)
		force.friction(gebi('frictionBox').value)
		force.linkStrength(gebi('linkStrengthBox').value)
		force.start()
	}

	function updateHiddenPerc() {
		gebi('nodesPercShown').style.width = nodes.length*100/nodeCount + '%'
		gebi('nodesPercHidden').style.width = hiddenNodes.length*100/nodeCount + '%'
	}

	// FUNCTIONS FOR GRAPH FOLDING:

	function hideNode(node) {
		// helper function to hide links:
		function hideLink(link) {
			hiddenLinks.push(links.splice(links.indexOf(link),1)[0])
		}
		// Pop the node of the nodes list and push it onto the hiddenNodes list:
		hiddenNodes.push(nodes.splice(nodes.indexOf(node),1)[0])
		// Pop/push any connected Links:
		toHideLinks = links.filter(function (lin) {return node.name == lin.source.name || node.name == lin.target.name})
		toHideLinks.map(hideLink)
		// Make the parents big!
		linkedNames = toHideLinks.map(function (x) {return x.source.name}).concat(toHideLinks.map(function (y) {return y.target.name}))
		toGrow = nodes.filter(function(thisNode) {return linkedNames.indexOf(thisNode.name) != -1})
		toGrow.map(function(d) {d.chargeMultiple = 1.5})
		}

	function showNode(node) {
		toInsert = hiddenNodes.splice(hiddenNodes.indexOf(node),1)[0]
		// Actually reveal.
		nodes.push(toInsert)
	}

	function showLink(link) {
		toInsert = hiddenLinks.splice(hiddenLinks.indexOf(link),1)[0]
		links.push(toInsert)
	}

	function foldOneLevel() {
		function isChild(node) {
			counter = 0;
			for (linkId in links) {
				if (node.name == links[linkId].source.name || node.name == links[linkId].target.name) {counter += 1}
			}
			if (1 == counter) {return true}
			else {return false}
		}
		// Find all the children:
		toHide = nodes.filter(isChild)
		// Hide them:
		toHide.map(hideNode)
		updateHiddenPerc()
		redraw()
	}

	function unfoldOneLevel() {
		// Find the hidden links that are connected to visible nodes:
		function attachedToVizNode(link) {
			return nodes.some(function(d) {return d.name == link.source.name || d.name == link.target.name})
		}
		linksToReveal = hiddenLinks.filter(attachedToVizNode)
		// Find the nodes that are attached to the revealed links:
		function attachedToRevealed(node) {
			return linksToReveal.some(function(d) {return node.name == d.source.name || node.name == d.target.name})
		}
		// Size the parents of revealed elements correctly.
		nodesToResize = nodes.filter(attachedToRevealed)
		nodesToResize.map(function(d) {d.chargeMultiple = 1})
		// Actually do the revealing.
		nodesToReveal = hiddenNodes.filter(attachedToRevealed)
		linksToReveal.map(showLink)
		nodesToReveal.map(showNode)
		updateHiddenPerc()
		redraw()
	}

	function unfoldAll() {
		while (hiddenLinks.length != 0) {
			links.push(hiddenLinks.pop())
		}
		while (hiddenNodes.length != 0) {
			nodes.push(hiddenNodes.pop())
		}
		nodes.map(function(d) {d.chargeMultiple = 1})
		updateHiddenPerc()
		redraw()
	}

	function unfoldAtSelected() {
		selNode = getSelectedNode()
		function attachedToSelected(link) {
			return selNode.name == link.source.name || selNode.name == link.target.name
		}
		linksToReveal = hiddenLinks.filter(attachedToSelected)
		// Find the nodes that are attached to the revealed links:
		function attachedToRevealed(node) {
			return linksToReveal.some(function(d) {return node.name == d.source.name || node.name == d.target.name})
		}
		nodesToReveal = hiddenNodes.filter(attachedToRevealed)
		// Size the parents of revealed elements correctly.
		nodesToResize = nodes.filter(attachedToRevealed)
		nodesToResize.map(function(d) {d.chargeMultiple = 1})
		// Actually do the revealing.
		linksToReveal.map(showLink)
		nodesToReveal.map(showNode)
		updateHiddenPerc()
		redraw()
	}

	function foldAtSelected() {
		selNode = getSelectedNode()
		function attachedToSelected(link) {
			return selNode.name == link.source.name || selNode.name == link.target.name
		}
		linksToHide = links.filter(attachedToSelected)
		// Find the nodes that are attached to the revealed links:
		function attachedToRevealed(node) {
			return linksToHide.some(function(d) {return node.name == d.source.name || node.name == d.target.name})
		}
		attachedNodes = nodes.filter(attachedToRevealed)
		nodesToHide = attachedNodes.filter(function(node) {return node.weight == 1 && node.name != selNode.name})
		// Size the parent correctly.
		if (nodesToHide.length > 0) {selNode.chargeMultiple = 1}
		// Actually do the hiding.
		nodesToHide.map(hideNode)
		updateHiddenPerc()
		redraw()
	}