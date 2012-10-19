(function() {

  ///////////
  // EVENTS - extracted from one of my personal projects
  ///////////
  var Events = {
    _listeners: {},

    // callback is the default context if undefined
    on: function(event, callback, context) {
      var list;

      // event and callback are required
      if (!event || !callback) return this;

      list = this._listeners[event] || (this._listeners[event] = []);
      list.push([event, callback, (context || callback)]);

      return this;
    },

    // event and callback are required and _listeners cannot be empty
    off: function(event, callback) {
      var listeners, i;

      if (!event || !callback || !(listeners = this._listeners[event])) return this;

      for (i = listeners.length; i >= 0; i--) {
        listener = listeners[i];
        if (callback === listener[1]) {
          callback.slice(i, 1)
        }
      }

      return this;
    },

    trigger: function(event) {
      var listeners, listener, callback, i;

      // _listeners cannot be empty
      if (!event || !(listeners = this._listeners[event])) return this;

      // avoiding an error if users try to get any property
      // from an undefined object
      for (i = listeners.length-1; i >= 0; i--) {
        listener = listeners[i];
        callback = listener[1];
        callback.apply(listener[2] || callback, arguments);
      }

      return this;
    }
  };

  ///////////
  // API
  ///////////
  var API = {
    endpoint: 'https://www.pivotaltracker.com/services/v3/',

    url: function(resource) {
      return this.endpoint + resource;
    },

    loginByUser: function(username, password) {
      this._getToken(username, password);
    },

    loginByToken: function(token) {
      sessionStorage.setItem('api-token', token);
      Events.trigger('user:logged');
    },

    getProjects: function() {
      $.ajax({
        headers: {'X-TrackerToken': sessionStorage.getItem('api-token')},
        type: 'GET',
        url: this.url('projects')
      }).done(function(resp){
        var projects = Projects.parse($(resp))
        Events.trigger('get:projects', projects);
      }).fail(function() {
        Events.trigger('user:not-logged');
      });
    },

    _getToken: function(username, password) {
      $.ajax({
        headers: {'Authorization':'Basic ' + btoa(username + ':' + password)},
        url: this.url('tokens/active'),
        dataType: 'xml',
      }).done(function(resp) {
        var xml = $(resp);
        API.loginByToken(xml.find('guid').text());
      }).fail(function() {
        Events.trigger('user:not-logged');
      });
    },

    getIterations: function(project) {
      $.ajax({
        headers: {'X-TrackerToken': sessionStorage.getItem('api-token')},
        type: 'GET',
        url: this.url('projects/' + project.id + '/iterations')
      }).done(function(resp){
        Iterations.parse($(resp), project);
        Events.trigger('get:iterations', project);
      }).fail(function() {
        Events.trigger('user:not-logged');
      });;
    }
  };

  ///////////
  // ENTITIES
  ///////////

  // Project
  var Projects = {
    parse: function(projectsXml) {
      var projects = [];

      projectsXml.find('project').each(function(index, value) {
        var project = Project.parse($(value));
        API.getIterations(project);
        projects.push(project);
      });
      return projects;
    }
  }

  var Project = function() { }

  Project.prototype.currentIteration = function() {
    return this.iterations[this.iterations.length-1];
  }

  Project.parse = function(projectXml) {
    var project = new Project();
    project.id = parseInt(projectXml.find('> id').text());
    project.name = projectXml.find('> name').text();
    project.membersLength = projectXml.find('membership').length;
    project.startDate = projectXml.find('> start_date').text();
    return project;
  }

  // Iteration
  var Iterations = {
    parse: function(iterationsXml, project) {
      var iterations = [];

      iterationsXml.find('iteration').each(function(index, value) {
        iterations.push(Iteration.parse($(value)));
      });
      project.iterations = iterations;
    }
  }

  var Iteration = function() { }

  Iteration.prototype.filter = function(state) {
    return _.filter(this.stories, function(story) {
      return story.state === state;
    });
  }

  Iteration.prototype.accepted = function() {
    return this.filter('accepted');
  }

  Iteration.prototype.rejected = function() {
    return this.filter('rejected');
  }

  Iteration.prototype.started = function() {
    return this.filter('started');
  }

  Iteration.prototype.unstarted = function() {
    return this.filter('unstarted');
  }

  Iteration.parse = function(iterationXml) {
    var iteration = new Iteration();
    iteration.id = parseInt(iterationXml.find('> id').text());
    iteration.stories = Stories.parse(iterationXml.find('> stories'));
    return iteration;
  }

  // Story
  var Stories = {
    parse: function(storiesXml) {
      var stories = [];

      storiesXml.find('story').each(function(index, value) {
        stories.push(Story.parse($(value)));
      });
      return stories;
    }
  }

  var Story = function() { }

  Story.parse = function(storyXml) {
    var story = new Story();
    story.name = storyXml.find('> name').text();
    story.state = storyXml.find('> current_state').text();
    return story;
  }

  ///////////
  // VIEWS
  ///////////

  // LoginView
  var LoginView = function(options) {
    this.$el = options.el;
  }

  LoginView.prototype.init = function() {
    if (this.$el.length) {
      this._cacheElements();
      this._attachEvents();
    }
  }

  LoginView.prototype._cacheElements = function() {
    this.$userForm = this.$el.find('#user-form');
    this.$tokenForm = this.$el.find('#token-form');
  }

  LoginView.prototype._attachEvents = function() {
    var doLoginByUser = $.proxy(this.doLoginByUser, this),
        doLoginByToken = $.proxy(this.doLoginByToken, this);

    this.$userForm.submit(doLoginByUser);
    this.$tokenForm.submit(doLoginByToken);
    Events.on('user:logged', this._logged, this);
    Events.on('user:not-logged', this._notLogged, this);
  }

  LoginView.prototype._notLogged = function() {
    this.$el.find('.error').append('Username/Password or token invalid');
    this.$el.fadeIn('fast');
  }

  LoginView.prototype._logged = function() {
    var self = this;
    this.$el.fadeOut(function() {
      API.getProjects();
    });
  }

  LoginView.prototype.doLoginByUser = function(e) {
    var username = this.$userForm.find('#username').val(),
        password = this.$userForm.find('#password').val();

    e.preventDefault();
    if (username && password) {
      API.loginByUser(username, password);
    }
  }

  LoginView.prototype.doLoginByToken = function(e) {
    var token = this.$tokenForm.find('#token').val();

    e.preventDefault();
    if (token) {
      API.loginByToken(token);
    }
  }

  // ProjectsView
  var ProjectsView = function(options) {
    this.$template = options.template;
  }

  ProjectsView.prototype.init = function() {
    this._attachEvents();
  }

  ProjectsView.prototype._attachEvents = function() {
    var render = $.proxy(this.render, this),
        renderProject = $.proxy(this._renderProject, this);

    Events.on('get:projects', render);
    Events.on('get:iterations', renderProject);
  }

  ProjectsView.prototype.render = function(event, data) {
    var parsedTemplate = _.template(this.$template.html(), {projects: data});

    $('#main').append(parsedTemplate);
    this.$el = $('#projects');
  }

  ProjectsView.prototype._renderProject = function(event, project) {
    var projectTemplate = $('#project-template').html(),
        $project = this.$el.find('#project-' + project.id),
        parsedTemplate;

    parsedTemplate = _.template(projectTemplate, {project: project});
    $project.html(parsedTemplate);
  }

  ///////////
  // APP
  ///////////
  new LoginView({el: $('#login')}).init();
  new ProjectsView({template: $('#projects-template')}).init();

}).call(this);