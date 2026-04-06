Feature: Task Board Backend API

  The backend API should expose working endpoints for health,
  tasks, and stats.

  @smoke @api
  Scenario: Health endpoint returns OK
    When I send a GET request to the backend "/health" endpoint
    Then the response status should be 200

  @api
  Scenario: Tasks endpoint returns an array
    When I send a GET request to the backend "/api/tasks" endpoint
    Then the response status should be 200
    And the response should be a JSON array

  @api
  Scenario: Stats endpoint returns valid structure
    When I send a GET request to the backend "/api/stats" endpoint
    Then the response status should be 200
    And the response should contain field "total"
    And the response should contain field "todo"
    And the response should contain field "inProgress"
    And the response should contain field "done"
