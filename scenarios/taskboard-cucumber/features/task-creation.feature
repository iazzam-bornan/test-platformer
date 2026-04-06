Feature: Task Creation

  Users should be able to create new tasks from the homepage.

  @crud
  Scenario: Create a new task via the UI
    Given I visit the homepage
    When I type "Buy groceries" into the "Add a new task..." input
    And I click the "Add" button
    Then I should see "Buy groceries" on the page
