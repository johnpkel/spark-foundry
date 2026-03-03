APIs for Content Analytics Audience Insights 



Sidebar: Entry Topics


API Request
Sample Request
GET  api.lytics.io/v2/content/classify?text=text of entry goes here

Sample Response
{ 
  "request_id": "foo-bar",
  "status": 200,
  "data": {
      "topics": { "apple": 0.5, "walnuts": 0.4 },
      "inferred_topics": { "almonds": 0.2 },
      "input": "text or URL", 
      "content": { "url": "foo.com", "description": "bar", ...}
   }
}



Sidebar: Audience Alignment
API Requests
Note: The Audience Alignment API is under active development.  Expectation April 1.
Audience Alignment API
Sample Request
POST api.lytics.io/v2/content/align
{
  "topics": {"topic_a": 0.4, "topic_b": 0.7}  // from v2/content/classify
}
Sample Response
{ 
  "request_id": "foo-bar",
  "status": 200,
  "data": [
    {
      "segment_id": "abc123",
      "segment_name": "Adventure",
      "segment_size": 165324,
      "alignment": 0.6
    }
  ]
}


Audience Sizes API
Sample Request
GET api.lytics.io/api/segment/sizes
(Docs here.)
Sample Response
{ 
  "request_id": "foo-bar",
  "status": 200,
  "data": [
        {
            "id": "d346473887ec8abcd0795a4002075ca6",
            "name": "Frequent Users",
            "slug_name": "ly_reporting_frequent_users",
            "size": 32,
            "timestamp": "2025-04-04T17:45:36Z"
        },
        {
            "id": "60ddb396344eb6d155f56daac98c2e58",
            "name": "Infrequent Users",
            "slug_name": "ly_reporting_infrequent_users",
            "size": 14313,
            "timestamp": "2025-04-04T17:45:36Z"
        }
  ]
}



Fullscreen: Audience Explorer
API Requests
Segment List API
The Segment List API will be needed to populate the list of audiences in the dropdown menu (“Users that have visited last 48 hours”, …)
Sample Request
GET api/segment
Sample Response
{ 
  "request_id": "foo-bar",
  "status": 200,
  "data": [
    {
      "id": "abc123",
      "name": "Adventure",
...
    }
  ]
}
Audience Affinity List (Field Info API)
The Field Info API produces aggregate calculations on user fields within an audience.  For the Audience Affinity bars on the left, you would make a Field Info request on the lytics_content field for the audience you’re querying.
Sample Request
GET api/segment/{segmentId}/fieldinfo?fields=lytics_content
Sample Response
{'data': {'segments': [{'id': 'bc814b372348b08b9e661e97f64735eb',
    'fields': [{'field': 'lytics_content',
      'terms_counts': {'Australia': 320259,
       'Brazil': 581975,
       'Carissa Moore': 667173,
       'Filipe Toledo': 563431,
       'Hawaii': 279194,
       'Heat': 286063,
       'John John Florence': 264228,
       'Kelly Slater': 721098,
       'Outerknown': 550918,
       'Portugal': 262332,
       'Round': 785551,
       'Surfers': 637072,
       'Tahiti': 381826,
       'Videos': 327751,
       'WSL': 816144,
       'Wave': 305744,
       'Waves': 561929,
       'World': 601405,
       'World Surf League': 924172},
      'more_terms': True,
      'ents_present': 961779,
      'ents_absent': 3364674,
      'approx_cardinality': 587,
      'last_updated': '2025-03-17T17:20:54.131745045Z'}]}]},
 'message': 'success',
 'status': 200}
Audience Affinity: Topic Summary (Field Info API)
For the Adventure summary on the right, you would make a Field Info request on the lytics_content field for the audience you’re querying, combined with the topic you’re querying on the audience with a dotted suffix (in this case, lytics_content.Australia).
Sample Request
GET api/segment/{segmentId}/fieldinfo?fields=lytics_content.Australia
Sample Response
{'data': {'segments': [{'id': 'bc814b372348b08b9e661e97f64735eb',
    'fields': [{'field': 'lytics_content.Australia',
      'terms_counts': {'0': 127,
       '0.03182949870824814': 2,
       '0.0437764972448349': 2,
       '0.0519886277616024': 2,
       '0.05441586300730705': 2,
       '0.07585299015045166': 2,
       '0.07780621200799942': 2,
       '0.08020193129777908': 2,
       '0.09123170375823975': 2,
       '0.09271406382322311': 2,
       '0.09471262246370316': 2,
       '0.10077333450317383': 2,
       '0.10586072504520416': 2,
       '0.11174934357404709': 2,
       '0.11300505697727203': 2,
       '0.1139746755361557': 2,
       '0.11429820209741592': 2,
       '0.11917711794376373': 2,
       '0.12875761091709137': 2,
       '1': 1364},
      'more_terms': True,
      'histograms': [{'data': {'0.01': 894,
         '0.02': 2410,
         '0.03': 4676,
         '0.04': 6258,
         '0.05': 7475,
         '0.06': 7906,
         '0.07': 8362,
         '0.08': 8771,
         '0.09': 8285,
         '0.10': 7591,
         '0.11': 7156,
         '0.12': 7647,
         '0.13': 7901,
         '0.14': 6860,
         '0.15': 6553,
         '0.16': 6622,
         '0.17': 6774,
         '0.18': 6362,
         '0.19': 5925,
         '0.20': 5386,
         '0.21': 4963,
         '0.22': 4574,
         '0.23': 4263,
         '0.24': 4222,
         '0.25': 4120,
         '0.26': 4380,
         '0.27': 4206,
         '0.28': 3930,
         '0.29': 3346,
         '0.30': 2637,
         '0.31': 2174,
         '0.32': 1924,
         '0.33': 1792,
         '0.34': 1678,
         '0.35': 1666,
         '0.36': 1557,
         '0.37': 1639,
         '0.38': 1485,
         '0.39': 1564,
         '0.40': 1655,
         '0.41': 1729,
         '0.42': 1635,
         '0.43': 1586,
         '0.44': 1554,
         '0.45': 1481,
         '0.46': 1610,
         '0.47': 1475,
         '0.48': 1549,
         '0.49': 1509,
         '0.50': 1680,
         '0.51': 1731,
         '0.52': 1737,
         '0.53': 1515,
         '0.54': 1270,
         '0.55': 1023,
         '0.56': 797,
         '0.57': 893,
         '0.58': 1106,
         '0.59': 1234,
         '0.60': 1252,
         '0.61': 1060,
         '0.62': 847,
         '0.63': 958,
         '0.64': 1520,
         '0.65': 2024,
         '0.66': 1827,
         '0.67': 1196,
         '0.68': 738,
         '0.69': 668,
         '0.70': 643,
         '0.71': 486,
         '0.72': 435,
         '0.73': 451,
         '0.74': 443,
         '0.75': 506,
         '0.76': 739,
         '0.77': 746,
         '0.78': 513,
         '0.79': 380,
         '0.80': 454,
         '0.81': 536,
         '0.82': 508,
         '0.83': 458,
         '0.84': 396,
         '0.85': 341,
         '0.86': 481,
         '0.87': 552,
         '0.88': 479,
         '0.89': 429,
         '0.90': 455,
         '0.91': 591,
         '0.92': 1239,
         '0.93': 1327,
         '0.94': 956,
         '0.95': 518,
         '0.96': 97,
         '0.97': 34,
         '0.98': 29,
         '0.99': 287,
         '1.00': 1155},
        'start': '0',
        'end': '1',
        'interval': ''}],
      'ents_present': 1022859,
      'ents_absent': 3412800,
      'approx_cardinality': 243189,
      'stats': {'mean': 0.269798943314291,
       'sd': 0.2343669132864645,
       'min': 0,
       'max': 1,
       'n': 244821},
      'last_updated': '2025-03-25T20:40:33.197715585Z'}]}]},
 'message': 'success',
 'status': 200}


Fullscreen: Topic Graph
API Requests
Topic Graph API
The topic graph consists of nodes (topics) and edges (relationships between topics).  Each topic has a label, a document count (how often it occurs), and X/Y coordinates.
Sample Request
GET api/content/taxonomy
Sample Response
Too large to copy: https://drive.google.com/file/d/1qeQ3ZmXW-IJ9ZNELjqvoaSXfiaHg1inC/view?usp=sharing


Fullscreen: Opportunity Explorer
API Requests
Opportunity API

Sample Request
GET api.lytics.io/v2/content/align
Sample Response
{
  "request_id": "abc-def-ghi",
  "status": 200,
  "data": {
    "topics": [
      {
        "topic": "Beach",
        "dimensions": [
          {
            "label": "Document Count",
            "value": 54,
            "subject": "content"
          },
          {
            "label": "Popularity",
            "value": 99,
            "subject": "content"
          },
          {
            "label": "Count",
            "value": 3456,
            "subject": "user"
          },
          {
            "label": "Intensity",
            "value": 65.4,
            "subject": "user"
          },
          {
            "label": "Likelihood to Purchase",
            "value": 34.5,
            "subject": "user"
          }
        ],
        "segments": [
          "qkjsdf",
          "oijwoe"
        ]
      }
    ]
  }
}
