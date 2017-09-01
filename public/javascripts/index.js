/**
 * Created by michaelhall on 5/3/17.
 */

//============================================================
// Code for opening the websocket and sending/receiving information through it
// Mostly button listeners and text boxes used to gather this information
//============================================================
var socket,
    inputDir,
    fileType,
    logCheck = document.querySelector('#logCheck'),
    logLocationBox = document.querySelector('#logLocation'),
    inputBox = document.querySelector('#input'),
    optsForm = document.querySelector('#opts');

// if log checkbox checked/unchecked, toggle text input
function logToggle() {
	logLocationBox.disabled = !logCheck.checked;
	logLocationBox.required = logCheck.checked;
	logLocationBox.value = '';
}

// when the form is submitted...
optsForm.addEventListener('submit', function(event) {
	event.preventDefault();

	// fade the form out
	fade(document.querySelector('#formContainer'));
	document.querySelectorAll('.results').forEach(function(element){
		unfade(element); // bring the results elements into view
	});

	inputDir = inputBox.value;
	fileType = document.querySelector('input[name=fileType]:checked').value;

	// options selected by user
	var opts = {
		input: inputDir,
		fileType: fileType,
		logLocation: logLocationBox.value
	};

	// send options to node
	socket.emit('opts', opts);
});

// open the websocket connection and store the socket in a variable to be used elsewhere
socket = io.connect(location.href);

socket.on('error', function(error) {
	console.log("Client-side socket error: ");
	console.log(error);
});

// when data is received from the species typer - via node
socket.on('stdout', function(data) {
	var probTotal = Number();
	// add in an "other" species if the probabilities dont add to 1.0
	data.data.forEach(function(d) { probTotal += +d.prob; });
	if (probTotal < 0.99) {
		data.data.push({
			species: "other",
			prob: 1.0 - probTotal,
			err: "N/A"
		});
	}

	// update the donut chart with the new data
	donut.data(data.data);

	// update the table of results
	updateDataTable(data);
});

socket.on('disconnect', function() {
	console.log("Socket closed...");
});

// initiate plotting
var donut = donutChart()
    .width(960)
    .height(600)
    .transTime(400)
    .cornerRadius(3)
    .padAngle(0.015)
    .variable('prob')
    .category('species');

d3.select('#chartContainer')
    .call(donut);

// function to fade out an element
function fade(element) {
	var op = 1;  // initial opacity
	var timer = setInterval(function () {
		if (op <= 0.1){
			clearInterval(timer);
			element.style.display = 'none';
		}
		element.style.opacity = op;
		element.style.filter = 'alpha(opacity=' + op * 100 + ")";
		op -= op * 0.1;
	}, 50);
}

// function to fade in an element
function unfade(element) {
	var op = 0.1;  // initial opacity
	element.style.display = 'block';
	var timer = setInterval(function () {
		if (op >= 1){
			clearInterval(timer);
		}
		element.style.opacity = op;
		element.style.filter = 'alpha(opacity=' + op * 100 + ")";
		op += op * 0.1;
	}, 10);
}

// function to format decimals as percentages
var percentFormat = d3.format(',.2%');

// function to update the data in the table
function updateDataTable(latest) {
	var timestamp = latest.timestamp,
	    data = latest.data;

	var rows = [],
	    total,
	    reads;

	// for every record in the data, create a row for the table
	for (var i = 0; i < data.length; i++) {
		var err = (!isNaN(parseFloat(data[i].err))) ? percentFormat(data[i].err) : 'N/A',
		    prob = (!isNaN(parseFloat(data[i].prob))) ? percentFormat(data[i].prob) : 'N/A',
		    species = data[i].species.trim().replace(/,$/g, ''),
		    sAligned = (data[i].sAligned === undefined) ? 'N/A' : parseFloat(data[i].sAligned);

		var rowData = [species, prob + ' &plusmn ' + err, sAligned];

		var row = document.createElement('tr');

		rowData.forEach(function(entry) {
			var cell = document.createElement('td');
			cell.innerHTML = entry;
			row.appendChild(cell);
		});

		rows.push(row);

		if (!total && data[i].tAligned !== undefined) total = data[i].tAligned;
		if (!reads && data[i].reads !== undefined) reads = data[i].reads;
	}

	// remove the old rows and add the new ones
	var tBody = document.querySelector('#dataTable tbody');
	while (tBody.firstChild) {
		tBody.removeChild(tBody.firstChild);
	}
	rows.forEach(function(row) {
		tBody.appendChild(row);
	});

	// update the timestamp and read count above the table
	document.querySelector('#timestamp').innerHTML = timestamp;
	document.querySelector('#reads').innerHTML = reads;
	document.querySelector('#tAligned').innerHTML = total;

}

//============================================================
// D3 code for making the donut chart
//============================================================
function donutChart() {
    var data = [],
        width,
        height,
        radius,
        margin = {top: 10, right: 10, bottom: 10, left: 10},
        colour = d3.scaleOrdinal(d3.schemeCategory20), // colour scheme
        variable, // value in data that will dictate proportions on chart
        category, // compare data by
        padAngle, // effectively dictates the gap between slices
        transTime, // transition time
        updateData,
        floatFormat = d3.format('.4r'),
        cornerRadius, // sets how rounded the corners are on each slice
        percentFormat = d3.format(',.2%');

    function chart(selection){
        selection.each(function() {
            // generate chart
            // ===========================================================================================
            // Set up constructors for making donut. See https://github.com/d3/d3-shape/blob/master/README.md
            radius = Math.min(width, height) / 2;

            // creates a new pie generator
            var pie = d3.pie()
                .value(function(d) { return floatFormat(d[variable]); })
                .sort(null);

            // contructs and arc generator. This will be used for the donut. The difference between outer and inner
            // radius will dictate the thickness of the donut
            var arc = d3.arc()
                .outerRadius(radius * 0.8)
                .innerRadius(radius * 0.6)
                .cornerRadius(cornerRadius)
                .padAngle(padAngle);

            // this arc is used for aligning the text labels
            var outerArc = d3.arc()
                .outerRadius(radius * 0.9)
                .innerRadius(radius * 0.9);
            // ===========================================================================================

            // ===========================================================================================
            // append the svg object to the selection
            // var svg = selection.append('svg')
            var svg = selection.append('svg')
                .attr('width', width + margin.left + margin.right)
                .attr('height', height + margin.top + margin.bottom)
                .append('g')
                .attr('transform', 'translate(' + width / 2 + ',' + height / 2 + ')');
            // ===========================================================================================

            // ===========================================================================================
            // g elements to keep elements within svg modular
            svg.append('g').attr('class', 'slices');
            svg.append('g').attr('class', 'labelName');
            svg.append('g').attr('class', 'lines');
            // ===========================================================================================

            // ===========================================================================================
            // add and colour the donut slices
            var path = svg.select('.slices')
                .selectAll('path')
                .data(pie(data))
                .enter().append('path')
                .attr('fill', function(d) { return colour(d.data[category]); })
                .attr('d', arc);
            // ===========================================================================================

            // ===========================================================================================
            // add text labels
            var label = svg.select('.labelName').selectAll('text')
                .data(pie(data))
              .enter().append('text')
                .attr('dy', '.35em')
                .html(updateLabelText)
                .attr('transform', labelTransform)
                .style('text-anchor', function(d) { return (midAngle(d)) < Math.PI ? 'start' : 'end'; });
            // ===========================================================================================

            // ===========================================================================================
            // add lines connecting labels to slice. A polyline creates straight lines connecting several points
            var polyline = svg.select('.lines')
                .selectAll('polyline')
                .data(pie(data))
                .enter().append('polyline')
                .attr('points', calculatePoints);
            // ===========================================================================================

            // ===========================================================================================
            // add tooltip to mouse events on slices and labels
            d3.selectAll('.labelName text, .slices path').call(toolTip);
            // ===========================================================================================

            // ===========================================================================================
            // FUNCTION TO UPDATE CHART
            updateData = function() {

                var updatePath = d3.select('.slices').selectAll('path');
                var updateLines = d3.select('.lines').selectAll('polyline');
                var updateLabels = d3.select('.labelName').selectAll('text');

                var data0 = path.data(), // store the current data before updating to the new
                    data1 = pie(data);

                // update data attached to the slices, labels, and polylines. the key function assigns the data to
                // the correct element, rather than in order of how the data appears. This means that if a category
                // already exists in the chart, it will have its data updated rather than removed and re-added.
                updatePath = updatePath.data(data1, key);
                updateLines = updateLines.data(data1, key);
                updateLabels = updateLabels.data(data1, key);

                // adds new slices/lines/labels
                updatePath.enter().append('path')
                    .each(function(d, i) { this._current = findNeighborArc(i, data0, data1, key) || d; })
                    .attr('fill', function(d) {  return colour(d.data[category]); })
                    .attr('d', arc);

                updateLines.enter().append('polyline')
                    .each(function(d, i) { this._current = findNeighborArc(i, data0, data1, key) || d; })
                    .attr('points', calculatePoints);

                updateLabels.enter().append('text')
                    .each(function(d, i) { this._current = findNeighborArc(i, data0, data1, key) || d; })
                    .html(updateLabelText)
                    .attr('transform', labelTransform)
                    .style('text-anchor', function(d) { return (midAngle(d)) < Math.PI ? 'start' : 'end'; });

                // removes slices/labels/lines that are not in the current dataset
                updatePath.exit()
                    .transition()
                    .duration(transTime)
                    .attrTween("d", arcTween)
                    .remove();

                updateLines.exit()
                    .transition()
                    .duration(transTime)
                    .attrTween("points", pointTween)
                    .remove();

                updateLabels.exit()
                    .remove();

                // animates the transition from old angle to new angle for slices/lines/labels
                updatePath.transition().duration(transTime)
                    .attrTween('d', arcTween);

                updateLines.transition().duration(transTime)
                    .attrTween('points', pointTween);

                updateLabels.transition().duration(transTime)
                    .attrTween('transform', labelTween)
                    .styleTween('text-anchor', labelStyleTween);

                updateLabels.html(updateLabelText); // update the label text

                // add tooltip to mouse events on slices and labels
                d3.selectAll('.labelName text, .slices path').call(toolTip);

            };
            // ===========================================================================================
            // Functions
            // calculates the angle for the middle of a slice
            function midAngle(d) { return d.startAngle + (d.endAngle - d.startAngle) / 2; }

            // function that creates and adds the tool tip to a selected element
            function toolTip(selection) {

                // add tooltip (svg circle element) when mouse enters label or slice
                selection.on('mouseenter', function (data) {

                    svg.append('text')
                        .attr('class', 'toolCircle')
                        .attr('dy', -30) // hard-coded. can adjust this to adjust text vertical alignment in tooltip
                        .html(toolTipHTML(data)) // add text to the circle.
                        .style('font-size', '.9em')
                        .style('text-anchor', 'middle'); // centres text in tooltip

                    svg.append('circle')
                        .attr('class', 'toolCircle')
                        .attr('r', radius * 0.57) // radius of tooltip circle
                        .style('fill', colour(data.data[category])) // colour based on category mouse is over
                        .style('fill-opacity', 0.35);

                });

                // remove the tooltip when mouse leaves the slice/label
                selection.on('mouseout', function () {
                    d3.selectAll('.toolCircle').remove();
                });
            }

            // function to create the HTML string for the tool tip. Loops through each key in data object
            // and returns the html string key: value
            function toolTipHTML(data) {
                var tip = '',
	                confInt = (!isNaN(parseFloat(data.data.err))) ? percentFormat(data.data.err) : 'N/A',
	                prob = (!isNaN(parseFloat(data.data[variable]))) ? percentFormat(data.data[variable]) : 'N/A';

	            // remove any trailing commas
	            var species = data.data[category].trim().replace(/,$/g, '');

	            // if values not present, set to N/A
	            var reads = (data.data.reads === undefined) ? 'N/A' : data.data.reads,
	                total = (data.data.tAligned === undefined) ? 'N/A' : data.data.tAligned,
	                subtotal = (data.data.sAligned === undefined) ?
		                'N/A' : parseFloat(data.data.sAligned);

                tip += '<tspan x="0">Species: </tspan><tspan id="dataPoints">' +
	                species + '</tspan>';
                tip += '<tspan x="0" dy="2em">Probability: </tspan><tspan id="dataPoints">' +
	                prob + ' &plusmn ' + confInt + '</tspan>';
                tip += '<tspan x="0" dy="2em">Num. reads analysed: </tspan><tspan id="dataPoints">' +
	                reads + '</tspan>';
                tip += '<tspan x="0" dy="2em">Num. reads aligned (total): </tspan><tspan id="dataPoints">' +
	                total + '</tspan>';
                tip += '<tspan x="0" dy="2em">Num. reads aligned (this): </tspan><tspan id="dataPoints">' +
	                subtotal + '</tspan>';

                return tip;
            }

            // calculate the points for the polyline to pass through
            function calculatePoints(d) {
                // see label transform function for explanations of these three lines.
                var pos = outerArc.centroid(d);
                pos[0] = radius * 0.95 * (midAngle(d) < Math.PI ? 1 : -1);
                return [arc.centroid(d), outerArc.centroid(d), pos]
            }

            function labelTransform(d) {
                // effectively computes the centre of the slice.
                // see https://github.com/d3/d3-shape/blob/master/README.md#arc_centroid
                var pos = outerArc.centroid(d);

                // changes the point to be on left or right depending on where label is.
                pos[0] = radius * 0.95 * (midAngle(d) < Math.PI ? 1 : -1);
                return 'translate(' + pos + ')';
            }

            function updateLabelText(d) {
                return d.data[category].trim().replace(/,$/g, '') + ': <tspan>' +
	                percentFormat(d.data[variable]) + '</tspan>';
            }

            // function that calculates transition path for label and also it's text anchoring
            function labelStyleTween(d) {
                this._current = this._current || d;
                var interpolate = d3.interpolate(this._current, d);
                this._current = interpolate(0);
                return function(t){
                    var d2 = interpolate(t);
                    return midAngle(d2) < Math.PI ? 'start':'end';
                };
            }

            function labelTween(d) {
                this._current = this._current || d;
                var interpolate = d3.interpolate(this._current, d);
                this._current = interpolate(0);
                return function(t){
                    var d2  = interpolate(t),
                        pos = outerArc.centroid(d2); // computes the midpoint [x,y] of the centre line that would be
                    // generated by the given arguments. It is defined as startangle + endangle/2 and innerR + outerR/2
                    pos[0] = radius * (midAngle(d2) < Math.PI ? 1 : -1); // aligns the labels on the sides
                    return 'translate(' + pos + ')';
                };
            }

            function pointTween(d) {
                this._current = this._current || d;
                var interpolate = d3.interpolate(this._current, d);
                this._current = interpolate(0);
                return function(t){
                    var d2  = interpolate(t),
                        pos = outerArc.centroid(d2);
                    pos[0] = radius * 0.95 * (midAngle(d2) < Math.PI ? 1 : -1);
                    return [arc.centroid(d2), outerArc.centroid(d2), pos];
                };
            }

            // function to calculate the tween for an arc's transition.
            // see http://bl.ocks.org/mbostock/5100636 for a thorough explanation.
            function arcTween(d) {
                var i = d3.interpolate(this._current, d);
                this._current = i(0);
                return function(t) { return arc(i(t)); };
            }

            function findNeighborArc(i, data0, data1, key) {
                var d;
                return (d = findPreceding(i, data0, data1, key)) ? {startAngle: d.endAngle, endAngle: d.endAngle}
                    : (d = findFollowing(i, data0, data1, key)) ? {startAngle: d.startAngle, endAngle: d.startAngle}
                        : null;
            }
            // Find the element in data0 that joins the highest preceding element in data1.
            function findPreceding(i, data0, data1, key) {
                var m = data0.length;
                while (--i >= 0) {
                    var k = key(data1[i]);
                    for (var j = 0; j < m; ++j) {
                        if (key(data0[j]) === k) return data0[j];
                    }
                }
            }

            function key(d) {
                return d.data[category];
            }

            // Find the element in data0 that joins the lowest following element in data1.
            function findFollowing(i, data0, data1, key) {
                var n = data1.length, m = data0.length;
                while (++i < n) {
                    var k = key(data1[i]);
                    for (var j = 0; j < m; ++j) {
                        if (key(data0[j]) === k) return data0[j];
                    }
                }
            }

            // ===========================================================================================

        });
    }

    // getter and setter functions. See Mike Bostocks post "Towards Reusable Charts" for a tutorial on how this works.
    chart.width = function(value) {
        if (!arguments.length) return width;
        width = value;
        return chart;
    };

    chart.height = function(value) {
        if (!arguments.length) return height;
        height = value;
        return chart;
    };

    chart.margin = function(value) {
        if (!arguments.length) return margin;
        margin = value;
        return chart;
    };

    chart.radius = function(value) {
        if (!arguments.length) return radius;
        radius = value;
        return chart;
    };

    chart.padAngle = function(value) {
        if (!arguments.length) return padAngle;
        padAngle = value;
        return chart;
    };

    chart.cornerRadius = function(value) {
        if (!arguments.length) return cornerRadius;
        cornerRadius = value;
        return chart;
    };

    chart.colour = function(value) {
        if (!arguments.length) return colour;
        colour = value;
        return chart;
    };

    chart.variable = function(value) {
        if (!arguments.length) return variable;
        variable = value;
        return chart;
    };

    chart.category = function(value) {
        if (!arguments.length) return category;
        category = value;
        return chart;
    };

    chart.transTime = function(value) {
        if (!arguments.length) return transTime;
        transTime = value;
        return chart;
    };

    chart.data = function(value) {
        if (!arguments.length) return data;
        data = value;
        if (typeof updateData === 'function') updateData();
        return chart;
    };

    return chart;
}
