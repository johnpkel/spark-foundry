Get segments

# Get segments

Get a list of segments for an account

# OpenAPI definition

```json
{
  "components": {
    "schemas": {
      "lioerrors.ApiV2ErrorOut": {
        "properties": {
          "code": {
            "description": "Lytics Error Code",
            "enum": [
              "UNKNOWN-000",
              "BADREQ-001",
              "JOB-BADREQ-002",
              "NOTFOUND-003",
              "JOB-NOTFOUND-004",
              "WF-NOTFOUND-005",
              "AUTH-NOTFOUND-006",
              "AUTHTYPE-NOTFOUND-007",
              "AUTH-BADREQ-008",
              "TABLE-NOTFOUND-009",
              "SCHEMA-NOTFOUND-010",
              "SCHEMAVERSION-NOTFOUND-011",
              "ENTITY-NOTFOUND-012",
              "QUERY-NOTFOUND-013",
              "STREAM-NOTFOUND-014",
              "PROVIDER-BADREQ-015",
              "PROVIDER-NOTFOUND-016",
              "UNAUTHORIZED-017",
              "SCHEMA-INVALID-018",
              "INTERNAL-019",
              "ROUTERULE-NOTFOUND-020",
              "ACCOUNT-NOTFOUND-021",
              "JOB-FAULT-022",
              "USER-NOTFOUND-023",
              "USER-BADREQ-024",
              "JSON-BADREQ-025",
              "FORBIDDEN-026"
            ],
            "type": "string"
          },
          "level": {
            "description": "When the error was generated",
            "type": "string"
          },
          "message": {
            "description": "A description of the error that occurred",
            "type": "string"
          },
          "timestamp": {
            "description": "The time the error occurred",
            "format": "date-time",
            "type": "string"
          }
        },
        "type": "object"
      },
      "models.ApiErrorResponse": {
        "properties": {
          "errors": {
            "description": "Lytics API Errors",
            "items": {
              "$ref": "#/components/schemas/lioerrors.ApiV2ErrorOut"
            },
            "type": "array"
          },
          "request_id": {
            "type": "string"
          },
          "status": {
            "description": "HTTP Status Code",
            "type": "integer"
          }
        },
        "type": "object"
      },
      "models.ApiResponse": {
        "properties": {
          "_meta": {
            "additionalProperties": true,
            "description": "Response Metadata",
            "type": "object"
          },
          "data": {
            "description": "Response Payload",
            "type": "object"
          },
          "request_id": {
            "type": "string"
          },
          "status": {
            "description": "HTTP Status Code",
            "type": "integer"
          }
        },
        "type": "object"
      },
      "models.Expr": {
        "properties": {
          "args": {
            "items": {
              "$ref": "#/components/schemas/models.Expr"
            },
            "type": "array"
          },
          "ident": {
            "type": "string"
          },
          "op": {
            "type": "string"
          },
          "val": {
            "type": "string"
          }
        },
        "type": "object"
      },
      "models.Segment": {
        "properties": {
          "account_id": {
            "type": "string"
          },
          "aid": {
            "type": "integer"
          },
          "ast": {
            "$ref": "#/components/schemas/models.Expr"
          },
          "author_id": {
            "type": "string"
          },
          "category": {
            "type": "string"
          },
          "created": {
            "type": "string"
          },
          "datemath_calc": {
            "type": "boolean"
          },
          "deleted": {
            "type": "boolean"
          },
          "description": {
            "type": "string"
          },
          "field_changes_fields": {
            "items": {
              "type": "string"
            },
            "type": "array"
          },
          "fields": {
            "items": {
              "type": "string"
            },
            "type": "array"
          },
          "forward_datemath": {
            "type": "boolean"
          },
          "groups": {
            "items": {
              "type": "string"
            },
            "type": "array"
          },
          "id": {
            "type": "string"
          },
          "identities": {
            "items": {
              "type": "string"
            },
            "type": "array"
          },
          "includes": {
            "items": {
              "type": "string"
            },
            "type": "array"
          },
          "invalid": {
            "type": "boolean"
          },
          "invalid_reason": {
            "type": "string"
          },
          "is_public": {
            "type": "boolean"
          },
          "kind": {
            "type": "string"
          },
          "name": {
            "type": "string"
          },
          "public_name": {
            "type": "string"
          },
          "ql_resolved": {
            "type": "string"
          },
          "save_hist": {
            "type": "boolean"
          },
          "schedule_exit": {
            "type": "boolean"
          },
          "segment_ql": {
            "type": "string"
          },
          "size": {
            "type": "integer"
          },
          "slug_name": {
            "type": "string"
          },
          "table": {
            "type": "string"
          },
          "tags": {
            "items": {
              "type": "string"
            },
            "type": "array"
          },
          "updated": {
            "type": "string"
          },
          "withs_ql": {
            "type": "string"
          }
        },
        "type": "object"
      }
    },
    "securitySchemes": {
      "ApiKeyAuth": {
        "in": "header",
        "name": "Authorization",
        "type": "apiKey"
      }
    }
  },
  "info": {
    "contact": {
      "email": "support@lytics.com",
      "name": "Lytics Support",
      "url": "https://support.lytics.com/hc/en-us"
    },
    "description": "Version 2 of the Lytics API",
    "termsOfService": "https://www.lytics.com/terms-of-service/",
    "title": "Lytics API",
    "version": "2.0"
  },
  "openapi": "3.0.3",
  "paths": {
    "/segment": {
      "get": {
        "description": "Get a list of segments for an account",
        "parameters": [
          {
            "description": "The account ID. Defaults to the user's default account.",
            "in": "query",
            "name": "account_id",
            "schema": {
              "type": "string"
            }
          },
          {
            "description": "Filter by table",
            "in": "query",
            "name": "table",
            "schema": {
              "type": "string"
            }
          },
          {
            "description": "Filter by valid (true|false|all)",
            "in": "query",
            "name": "valid",
            "schema": {
              "type": "string"
            }
          },
          {
            "description": "Filter by kind (segment|goal|aspect|conversion|managed|all)",
            "in": "query",
            "name": "kind",
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "content": {
              "application/json": {
                "schema": {
                  "allOf": [
                    {
                      "$ref": "#/components/schemas/models.ApiResponse"
                    },
                    {
                      "properties": {
                        "data": {
                          "items": {
                            "$ref": "#/components/schemas/models.Segment"
                          },
                          "type": "array"
                        }
                      },
                      "type": "object"
                    }
                  ]
                }
              }
            },
            "description": "Segment List Response"
          },
          "400": {
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/models.ApiErrorResponse"
                }
              }
            },
            "description": "Bad Request"
          },
          "404": {
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/models.ApiErrorResponse"
                }
              }
            },
            "description": "Not Found"
          },
          "500": {
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/models.ApiErrorResponse"
                }
              }
            },
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "ApiKeyAuth": []
          }
        ],
        "summary": "Get segments",
        "tags": [
          "Segments"
        ]
      }
    }
  },
  "servers": [
    {
      "url": "https://api.lytics.io/v2"
    }
  ]
}
```