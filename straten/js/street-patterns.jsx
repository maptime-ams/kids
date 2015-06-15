var Steps = React.createClass({
  render: function() {
    var _this = this;

    return (
      <div id="steps">
      {this.props.steps.slice(0, this.props.stepData.length).map(function(step, index) {

        var boundNextStep = _this.onNextStep.bind(_this, index);
        return React.createElement(step.component, {
          key: index,
          data: _this.props.stepData[index],
          onNextStep: boundNextStep,
          backgroundColor: step.props.backgroundColor
        });
      })}
      </div>
    );
  },

  onNextStep: function(index, data) {
    var stepData = this.props.stepData.slice(0, index + 1),
        lastStepData = stepData[stepData.length - 1];

    for (var attrname in lastStepData) {
      if (!data[attrname]) {
        data[attrname] = lastStepData[attrname];
      }
    }

    stepData.push(data);
    this.setProps({stepData: stepData});

    setTimeout(function() {
      var node = document.querySelector("#steps section:nth-child(" + (index + 2) + ")");
      d3.transition()
          .duration(900)
          .tween("scroll", scrollTween(node.offsetTop));
    }, 150);
  }
});

var StepMixin = {
  componentDidMount: function() {
    React.findDOMNode(this).style.backgroundColor = this.props.backgroundColor;
  }
}

var StepIntro = React.createClass({
  mixins: [StepMixin],

  render: function() {
    return (
      <section>
        <div className="container">
          <div className="row">
            <h1>Zoek een stratenpatroon!</h1>
            <p>Met deze website kun je een mooi stratenpatroon zoeken, en deze met de lasersnijder in ons Fablab uit hout laten uitsnijden! Zoek bijvoorbeeld je eigen huis en de straten in de buurt, of een ander patroon dat je mooi vindt.</p>
          </div>
        </div>
        <div className="button-bottom">
          <button onClick={this.onButtonClick}>OK, beginnen!</button>
        </div>
      </section>
    )
  },

  onButtonClick: function() {
    this.props.onNextStep({});
  }
});

var StepMap = React.createClass({
  mixins: [StepMixin],

  render: function() {
    return (
      <section>
        <div id="step-map-map" className="map"/>
        <div id="step-map-hole" />
        <div className="button-bottom">
          <button onClick={this.onButtonClick}>Ja, deze wil ik (heb geduld, duurt even)!</button>
        </div>
        <div className="input-top">
          <input type="search" placeholder="Zoek je adres..." id="step-map-geocode" onKeyUp={this.onGeocode}/>
        </div>
      </section>
    )
  },

  componentDidMount: function() {
    var map = L.map('step-map-map', {
        zoomControl: false,
        attributionControl: false,
        minZoom: 17, maxZoom: 17,
        zoom: 17,
        center: [52.3404,4.9431]
      }),
      hash = new L.Hash(map);

    addTileLayer(map);

    map.touchZoom.disable();
    map.doubleClickZoom.disable();
    map.scrollWheelZoom.disable();

    this.map = map;
  },
  
  onGeocode: function(e) {
    var _this = this;

    if (e.keyCode == 13) {
      var value = d3.select("#step-map-geocode").property('value');
      d3.json("http://nominatim.openstreetmap.org/?format=json&q=" + value + "&format=json&limit=1", function(error, data) {
        if (data[0] && data[0].lat) {
          _this.map.panTo([data[0].lat, data[0].lon]);
        }
      });
    }
  },

  onButtonClick: function() {
    var step = this;
    var center = this.map.getCenter();
    var radius = 200
    var point = {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [center.lng, center.lat]
      }
    };
    var coordinates = point.geometry.coordinates;
    var query = [
      "[out:json];",
      "way[\"highway\"](around:" + radius + "," + [coordinates[1], coordinates[0]].join(",") + ");",
      "(._;>;);",
      "out;"
    ].join("\n");
    
    query_overpass(query, function(error, geojson) {
      if (error || !geojson.features || geojson.features.length == 0) {
        
      } else {
        var geojson = {
          type: "FeatureCollection",
          features: geojson.features.filter(function(feature) {
            return feature.geometry.type !== "Point";
          })
        };
        
        var roadWidth = 8; // meters
        var union;
        geojson.features.forEach(function(feature, i) {
          var buffered = turf.buffer(feature, roadWidth, 'meters').features[0];
          if (union) {
            union = turf.union(buffered, union);
          } else {
            union = buffered;
          }
        });
        
        var angles = [];
        for (var a = 0; a <= 360; a++) {
          angles.push(a);
        }

        var circle = {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [
              angles.map(function(a) {
                var p = turf.destination(point, radius / 1000, a, "kilometers");
                return p.geometry.coordinates;
              })
            ]
          }
        };
        
        var intersection = turf.intersect(union, circle);

        step.props.onNextStep({
          geojson: intersection
        });  
      }
    });
  }
});

var StepTurfIntersect = React.createClass({
  mixins: [StepMixin],

  render: function() {
    return (
      <section>
        <div id="step-turf-intersect-map" className="map"/>
        <div className="button-bottom">
          <button onClick={this.onButtonClick}>Ja, ja, ja!</button>
        </div>
      </section>
    )
  },

  componentDidMount: function() {
    var map = L.map('step-turf-intersect-map', {
        attributionControl: false,
        minZoom: 14, maxZoom: 17,
      }),
      pointStyle = {},
      lineStyle = {
        color: "black",
        weight: 3,
        opacity: 1
      },
      geojsonLayer = new L.geoJson(this.props.data.geojson, {
        style: lineStyle,
        pointToLayer: function (feature, latlng) {
          return L.circleMarker(latlng, pointStyle);
        }
      }
      ).addTo(map);

    addTileLayer(map, 0.3);

    map.fitBounds(geojsonLayer.getBounds());

    map.touchZoom.disable();
    map.scrollWheelZoom.disable();

    this.map = map;
  },

  onButtonClick: function() {
    var rect = d3.select("#step-turf-intersect-map .leaflet-overlay-pane svg")[0][0].getBBox(),
        svgAttrs = 'viewBox="' + [rect.x, rect.y, rect.width, rect.height].join(" ") + '"'
            + ' height="' + rect.height + '" width="' + rect.width + '"'
            + ' style="transform: translate(0, 0);"',
        svg = d3.select("#step-turf-intersect-map .leaflet-overlay-pane")
            .html()
            .replace(/<svg .*?>/, '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" ' + svgAttrs + '>'),
        b64 = btoa(svg);

    this.props.onNextStep({
      svg: b64
    });
  }
});

var StepSVG = React.createClass({
  mixins: [StepMixin],

  render: function() {
    var svgSrc = "data:image/svg+xml;base64," + this.props.data.svg;
    return (
      <section>
        <div className="container">
          <div className="row">
            <h2>Klaar! Op naar de lasersnijder!</h2>
            <p>
               Klaar! Je hebt je eigen hoogstpersoonlijke stratenpatroon gemaakt. Deze kunnen we nu uitsnijden met de lasersnijder. Roep één van de begeleiders, dan slaan we het patroon op op een USB-stick, en gaan we naar het Fablab.
            </p>
            <p>
              <img id="step-svg-img" alt="street-pattern" download='street-pattern.svg' src={svgSrc}/>
            </p>
          </div>
        </div>
      </section>
    )
  }
});

var colors = [
  // "#6d3fea", //"#4800e5",
  // "#8000e1",
  // "#b600de",
  // "#db00cc",
  // "#d80093",
  // "#d5005b",
  // "#d20025",
  // "#ce0e00",
  "#cb4100",
  "#c87200",
  "#c5a100",
  "#b4c200",
  "#82bf00"
];

var steps = [
  { component: StepIntro, props: { color: "white"  } },
  { component: StepMap, props: { } },
  { component: StepTurfIntersect, props: { } },
  { component: StepSVG, props: { } }
];

steps = steps.map(function(step, index) {
  step.props.backgroundColor = colors[index];
  return step;
});

var stepData = [
  {}
];

React.render(
  <Steps steps={steps} stepData={stepData}/>,
  document.getElementById('steps-container')
);
